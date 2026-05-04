import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiMessageRole, AiOwnerRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StreamChatDto } from './dto/stream-chat.dto';

export type AiContactSnippet = {
  id: string;
  name: string;
  relation?: string | null;
  description?: string | null;
  photoUrl?: string | null;
  phone?: string | null;
  birthday?: string | null;
  isEmergencyContact?: boolean;
};

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private toOwnerRole(role: string): AiOwnerRole {
    if (role === 'PATIENT') return AiOwnerRole.PATIENT;
    if (role === 'ADMIN') return AiOwnerRole.ADMIN;
    return AiOwnerRole.CAREGIVER;
  }

  private async resolvePatientIdForContext(
    userId: string,
    role: string,
    requestedPatientId?: string,
  ): Promise<string | null> {
    if (role === 'PATIENT') return userId;
    if (!requestedPatientId) return null;

    // Doctors access their assigned patients
    if (role === 'DOCTOR' || role === 'ADMIN') {
      const doctorLink = await this.prisma.doctorPatient.findUnique({
        where: {
          doctorId_patientId: {
            doctorId: userId,
            patientId: requestedPatientId,
          },
        },
      });
      if (doctorLink) return requestedPatientId;
    }

    // Caregivers access their linked patients
    const link = await this.prisma.patientCaregiver.findUnique({
      where: {
        patientId_caregiverId: {
          patientId: requestedPatientId,
          caregiverId: userId,
        },
      },
    });
    if (!link) {
      throw new ForbiddenException('No access to selected patient context');
    }
    return requestedPatientId;
  }

  private async getPatientClinicalSummary(patientId: string): Promise<string> {
    const [anamneze, mmseTests, treatments] = await Promise.all([
      this.prisma.anamneze.findMany({
        where: { patientId },
        orderBy: { updatedAt: 'desc' },
        take: 3,
        select: { content: true, updatedAt: true },
      }),
      this.prisma.mMSETest.findMany({
        where: { patientId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { score: true, createdAt: true },
      }),
      this.prisma.treatment.findMany({
        where: { patientId },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: { description: true, createdAt: true },
      }),
    ]);

    const lines: string[] = [];

    if (anamneze.length > 0) {
      lines.push('--- Disease History (Anamneze) ---');
      for (const entry of anamneze) {
        lines.push(
          `[${new Date(entry.updatedAt).toLocaleDateString()}] ${entry.content}`,
        );
      }
    }

    if (mmseTests.length > 0) {
      lines.push('--- MMSE Scores (most recent first) ---');
      for (const test of mmseTests) {
        lines.push(
          `[${new Date(test.createdAt).toLocaleDateString()}] Score: ${test.score}/30`,
        );
      }
    }

    if (treatments.length > 0) {
      lines.push('--- Active Treatments ---');
      for (const treatment of treatments) {
        lines.push(
          `[${new Date(treatment.createdAt).toLocaleDateString()}] ${treatment.description}`,
        );
      }
    }

    return lines.length > 0
      ? lines.join('\n')
      : 'No clinical data recorded yet.';
  }

  private async getMatchedContacts(
    patientId: string | null,
    userText: string,
  ): Promise<AiContactSnippet[]> {
    if (!patientId) return [];
    if (!userText.trim()) return [];

    const contacts = await this.prisma.contact.findMany({
      where: { patientId },
      select: {
        id: true,
        name: true,
        relation: true,
        description: true,
        photoUrl: true,
        phone: true,
        isEmergencyContact: true,
      },
      orderBy: [{ isEmergencyContact: 'desc' }, { createdAt: 'asc' }],
    });

    const normalizedQuery = userText.toLowerCase();
    const escapeRegExp = (value: string) =>
      value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const hasExplicitContactIntent =
      /\b(my|our)\s+(contact|relative|family|caregiver|mother|father|sister|brother|son|daughter|wife|husband|partner|friend)\b/i.test(
        normalizedQuery,
      ) ||
      /\b(emergency contact|who is my|call my|show my contact|who takes care|caregiver|contact info|phone number of|number of|reach)\b/i.test(
        normalizedQuery,
      );

    // Also detect relation-based queries (e.g. "my mom", "her sister")
    const relationKeywords = [
      'mother',
      'father',
      'mom',
      'dad',
      'sister',
      'brother',
      'son',
      'daughter',
      'wife',
      'husband',
      'partner',
      'friend',
      'caregiver',
      'nurse',
      'doctor',
    ];
    const hasRelationQuery = relationKeywords.some((kw) =>
      new RegExp(`\\b${kw}\\b`, 'i').test(normalizedQuery),
    );

    const matches = contacts.filter((contact) => {
      const fullName = contact.name.toLowerCase().trim();
      if (!fullName) return false;

      // Strong match: full name appears as a phrase in the query.
      const fullNameRegex = new RegExp(`\\b${escapeRegExp(fullName)}\\b`, 'i');
      if (fullNameRegex.test(normalizedQuery)) return true;

      // Match by relation label (e.g. user asks "my sister" and contact.relation === "SISTER")
      if (contact.relation) {
        const rel = contact.relation.toLowerCase();
        if (new RegExp(`\\b${escapeRegExp(rel)}\\b`, 'i').test(normalizedQuery))
          return true;
      }

      // Fallback: all meaningful name tokens (≥4 chars) appear as whole words.
      const tokens = fullName.split(/\s+/).filter((t) => t.length >= 4);
      if (tokens.length < 2) return false;
      return tokens.every((token) =>
        new RegExp(`\\b${escapeRegExp(token)}\\b`, 'i').test(normalizedQuery),
      );
    });

    const hasIntent = hasExplicitContactIntent || hasRelationQuery;

    if (matches.length === 0 && !hasIntent) {
      return [];
    }

    // Prefer matches; fall back to emergency contacts, then first contact
    const selectedContacts =
      matches.length > 0
        ? matches.slice(0, 4)
        : contacts.filter((c) => c.isEmergencyContact).slice(0, 1).length > 0
          ? contacts.filter((c) => c.isEmergencyContact).slice(0, 1)
          : contacts.slice(0, 1);

    return selectedContacts.map((c) => ({
      id: c.id,
      name: c.name,
      relation: c.relation || null,
      description: c.description || null,
      photoUrl: c.photoUrl,
      phone: c.phone,
      birthday: null,
      isEmergencyContact: c.isEmergencyContact,
    }));
  }

  private buildSystemInstruction(context: {
    contacts: AiContactSnippet[];
    clinicalSummary?: string | null;
    caregiverName?: string | null;
  }): string {
    const hasContacts = context.contacts.length > 0;

    const contactsSummary = hasContacts
      ? context.contacts
          .map((c) => {
            const parts = [`Name: ${c.name}`];
            if (c.relation) parts.push(`Relation: ${c.relation}`);
            if (c.phone) parts.push(`Phone: ${c.phone}`);
            if (c.isEmergencyContact) parts.push('Emergency contact: Yes');
            if (c.description) parts.push(`Bio/Notes: ${c.description}`);
            if (c.photoUrl) parts.push(`Has photo: Yes`);
            return `• ${parts.join(' | ')}`;
          })
          .join('\n')
      : 'No specific contact matched for this prompt.';

    const lines = [
      "You are MemiMinds, a warm, knowledgeable, and caring AI companion specializing in Alzheimer's and dementia support.",
      'You assist caregivers, doctors, and patients with education, emotional support, and practical guidance.',
      '',
      '## Core rules',
      '- Provide medically careful, evidence-based information only.',
      '- Never diagnose. Never replace professional clinical advice.',
      '- When uncertain, acknowledge it and encourage professional consultation.',
      '- Use compassionate, clear, and simple language.',
      '- Respond in the same language the user is writing in.',
      '',
      '## When asked about a specific person (contact/relative/caregiver)',
      '- Use ONLY the contact data provided below — never invent personal details.',
      '- Write a warm, narrative bio that integrates all available facts (name, relation, phone, notes).',
      '- If a photo exists, acknowledge it naturally (e.g. "As shown in the photo above...").',
      '- Always end with a "Contact snapshot" section formatted as:',
      '  ### Contact snapshot',
      '  **Name:** ... | **Relation:** ... | **Phone:** ... | **Emergency:** Yes/No',
      '- If the user asks for a phone number, state it clearly and prominently.',
      '',
      '## Contact context for this conversation',
      contactsSummary,
    ];

    if (context.caregiverName) {
      lines.push(
        '',
        `## Current caregiver/user`,
        `The person using this app right now is: ${context.caregiverName}.`,
      );
    }

    if (context.clinicalSummary) {
      lines.push(
        '',
        '## Patient clinical context',
        "(Use this to answer questions about the patient's history, illness, medications, and test results.)",
        context.clinicalSummary,
        '--- End of clinical context ---',
        'Present clinical findings objectively. Always recommend professional evaluation for interpretation.',
      );
    }

    return lines.join('\n');
  }

  async createStreamContext(
    userId: string,
    role: string,
    dto: StreamChatDto,
  ): Promise<{
    geminiApiKey: string;
    systemInstruction: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    matchedContacts: AiContactSnippet[];
    lastUserMessage: string;
  }> {
    const geminiApiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new InternalServerErrorException(
        'GEMINI_API_KEY is not configured',
      );
    }

    const patientId = await this.resolvePatientIdForContext(
      userId,
      role,
      dto.patientId,
    );

    const lastUser = [...dto.messages]
      .reverse()
      .find((m) => m.role === 'user')?.content;

    // Fetch caregiver/doctor name to personalize the system prompt
    let caregiverName: string | null = null;
    if (role !== 'PATIENT') {
      const caller = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });
      if (caller)
        caregiverName = `${caller.firstName} ${caller.lastName}`.trim();
    }

    const [matchedContacts, clinicalSummary] = await Promise.all([
      this.getMatchedContacts(patientId, lastUser || ''),
      patientId
        ? this.getPatientClinicalSummary(patientId)
        : Promise.resolve(null),
    ]);

    return {
      geminiApiKey,
      systemInstruction: this.buildSystemInstruction({
        contacts: matchedContacts,
        clinicalSummary,
        caregiverName,
      }),
      messages: dto.messages,
      matchedContacts,
      lastUserMessage: lastUser || '',
    };
  }

  async upsertConversation(
    userId: string,
    role: string,
    dto: StreamChatDto,
  ): Promise<{ id: string; patientId: string | null }> {
    const ownerRole = this.toOwnerRole(role);
    const resolvedPatientId = await this.resolvePatientIdForContext(
      userId,
      role,
      dto.patientId,
    );

    if (dto.conversationId) {
      const existing = await this.prisma.aiConversation.findFirst({
        where: {
          id: dto.conversationId,
          ownerId: userId,
          ownerRole,
        },
        select: { id: true, patientId: true },
      });
      if (!existing) {
        throw new NotFoundException('Conversation not found');
      }
      return { id: existing.id, patientId: existing.patientId };
    }

    const firstUser =
      dto.messages.find((m) => m.role === 'user')?.content || 'New chat';
    const created = await this.prisma.aiConversation.create({
      data: {
        ownerId: userId,
        ownerRole,
        patientId: resolvedPatientId || null,
        title: firstUser.slice(0, 80),
      },
      select: {
        id: true,
        patientId: true,
      },
    });

    return { id: created.id, patientId: created.patientId };
  }

  async saveExchange(
    conversationId: string,
    userText: string,
    assistantText: string,
    contacts: AiContactSnippet[],
  ) {
    if (!userText.trim() && !assistantText.trim()) return;

    await this.prisma.$transaction(async (tx) => {
      if (userText.trim()) {
        await tx.aiConversationMessage.create({
          data: {
            conversationId,
            role: AiMessageRole.USER,
            content: userText,
          },
        });
      }

      if (assistantText.trim()) {
        await tx.aiConversationMessage.create({
          data: {
            conversationId,
            role: AiMessageRole.ASSISTANT,
            content: assistantText,
            contactSnapshot: contacts.length > 0 ? contacts : undefined,
          },
        });
      }

      await tx.aiConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
    });
  }

  async listConversations(userId: string, role: string, patientId?: string) {
    const ownerRole = this.toOwnerRole(role);
    const where = {
      ownerId: userId,
      ownerRole,
      ...(patientId ? { patientId } : {}),
    };
    return this.prisma.aiConversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        patientId: true,
        createdAt: true,
        updatedAt: true,
      },
      take: 30,
    });
  }

  async getConversationMessages(
    userId: string,
    role: string,
    conversationId: string,
  ) {
    const ownerRole = this.toOwnerRole(role);
    const conversation = await this.prisma.aiConversation.findFirst({
      where: {
        id: conversationId,
        ownerId: userId,
        ownerRole,
      },
      select: { id: true },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return this.prisma.aiConversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        contactSnapshot: true,
        createdAt: true,
      },
    });
  }

  async deleteConversation(
    userId: string,
    role: string,
    conversationId: string,
  ) {
    const ownerRole = this.toOwnerRole(role);
    const conversation = await this.prisma.aiConversation.findFirst({
      where: {
        id: conversationId,
        ownerId: userId,
        ownerRole,
      },
      select: { id: true },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    await this.prisma.aiConversation.delete({ where: { id: conversationId } });
    return { success: true };
  }
}

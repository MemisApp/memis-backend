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

type AiContactSnippet = {
  id: string;
  name: string;
  description?: string | null;
  photoUrl?: string | null;
  phone?: string | null;
  birthday?: string | null;
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
        description: true,
        photoUrl: true,
        phone: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const normalizedQuery = userText.toLowerCase();
    const escapeRegExp = (value: string) =>
      value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const hasExplicitContactIntent =
      /\b(my|our)\s+(contact|relative|family|caregiver)\b/i.test(normalizedQuery) ||
      /\b(emergency contact|who is my|call my|show my contact)\b/i.test(
        normalizedQuery,
      );

    const matches = contacts.filter((contact) => {
      const fullName = contact.name.toLowerCase().trim();
      if (!fullName) return false;

      // Strong match: full name appears as phrase.
      const fullNameRegex = new RegExp(`\\b${escapeRegExp(fullName)}\\b`, 'i');
      if (fullNameRegex.test(normalizedQuery)) return true;

      // Fallback: all meaningful name tokens appear as whole words.
      const tokens = fullName.split(/\s+/).filter((t) => t.length >= 4);
      if (tokens.length < 2) return false;
      return tokens.every((token) =>
        new RegExp(`\\b${escapeRegExp(token)}\\b`, 'i').test(normalizedQuery),
      );
    });

    if (matches.length === 0 && !hasExplicitContactIntent) {
      return [];
    }

    const selectedContacts =
      matches.length > 0 ? matches.slice(0, 4) : contacts.slice(0, 1);

    return selectedContacts.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description || 'No description available',
      photoUrl: c.photoUrl,
      phone: c.phone,
      birthday: null, // Contact birthday is not yet modeled.
    }));
  }

  private buildSystemInstruction(context: {
    contacts: AiContactSnippet[];
  }): string {
    const contactsSummary =
      context.contacts.length > 0
        ? context.contacts
            .map(
              (c) =>
                `- ${c.name}; description: ${c.description || 'n/a'}; phone: ${
                  c.phone || 'n/a'
                }; birthday: unknown`,
            )
            .join('\n')
        : 'No contact context matched for this prompt.';

    return [
      'You are MemiMinds, a clever and playful Alzheimer/dementia support assistant.',
      'Provide medically careful, evidence-based general education only.',
      'Do not diagnose, and do not replace clinician advice.',
      'When discussing treatments, mention uncertainty and encourage professional consultation.',
      'Prioritize current consensus guidance and established evidence.',
      'If user asks about a named person/relative, use only provided contact context and never invent personal facts.',
      'When contact context exists, include a brief "Contact snapshot" section using those facts.',
      'Contact context:',
      contactsSummary,
    ].join('\n');
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
      throw new InternalServerErrorException('GEMINI_API_KEY is not configured');
    }

    const patientId = await this.resolvePatientIdForContext(
      userId,
      role,
      dto.patientId,
    );

    const lastUser = [...dto.messages]
      .reverse()
      .find((m) => m.role === 'user')?.content;
    const matchedContacts = await this.getMatchedContacts(
      patientId,
      lastUser || '',
    );

    return {
      geminiApiKey,
      systemInstruction: this.buildSystemInstruction({
        contacts: matchedContacts,
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

    const firstUser = dto.messages.find((m) => m.role === 'user')?.content || 'New chat';
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

  async getConversationMessages(userId: string, role: string, conversationId: string) {
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

  async deleteConversation(userId: string, role: string, conversationId: string) {
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

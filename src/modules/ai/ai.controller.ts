import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Query,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AiService } from './ai.service';
import { StreamChatDto } from './dto/stream-chat.dto';

type AuthenticatedRequest = Request & {
  user: {
    id: string;
    role: string;
  };
};

@ApiTags('ai')
@Controller('/api/ai')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('/conversations')
  @ApiOperation({ summary: 'List AI conversations for current user' })
  async listConversations(
    @Req() req: AuthenticatedRequest,
    @Query('patientId') patientId?: string,
  ) {
    return this.aiService.listConversations(req.user.id, req.user.role, patientId);
  }

  @Get('/conversations/:conversationId/messages')
  @ApiOperation({ summary: 'Get AI conversation messages' })
  async getConversationMessages(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
  ) {
    return this.aiService.getConversationMessages(
      req.user.id,
      req.user.role,
      conversationId,
    );
  }

  @Delete('/conversations/:conversationId')
  @ApiOperation({ summary: 'Delete AI conversation' })
  async deleteConversation(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
  ) {
    return this.aiService.deleteConversation(req.user.id, req.user.role, conversationId);
  }

  /**
   * Non-streaming endpoint used by Android clients (and any client that
   * cannot consume SSE).  Returns the full assistant reply as plain JSON
   * once Gemini finishes, so there is no buffering/streaming issue.
   */
  @Post('/chat')
  @ApiOperation({ summary: 'Non-streaming AI chat (for Android / fallback)' })
  async chat(
    @Req() req: AuthenticatedRequest,
    @Body() dto: StreamChatDto,
  ) {
    const conversation = await this.aiService.upsertConversation(
      req.user.id,
      req.user.role,
      dto,
    );
    const context = await this.aiService.createStreamContext(
      req.user.id,
      req.user.role,
      dto,
    );

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${context.geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: context.systemInstruction }],
          },
          contents: context.messages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 1100,
          },
        }),
      },
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      throw new Error(`Gemini error: ${errorText}`);
    }

    const json = (await geminiResponse.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const assistantText =
      json?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || '')
        .join('') || '';

    await this.aiService.saveExchange(
      conversation.id,
      context.lastUserMessage,
      assistantText,
      context.matchedContacts,
    );

    return {
      conversationId: conversation.id,
      text: assistantText,
      contacts: context.matchedContacts,
    };
  }

  @Post('/chat/stream')
  @ApiOperation({ summary: 'Stream AI response for chat (SSE)' })
  async streamChat(
    @Req() req: AuthenticatedRequest,
    @Body() dto: StreamChatDto,
    @Res() res: Response,
  ) {
    const conversation = await this.aiService.upsertConversation(
      req.user.id,
      req.user.role,
      dto,
    );
    const context = await this.aiService.createStreamContext(
      req.user.id,
      req.user.role,
      dto,
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Disable Nginx / Render.com proxy buffering so chunks arrive in real-time
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (payload: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    send({ type: 'conversation', conversationId: conversation.id });
    send({ type: 'contacts', contacts: context.matchedContacts });
    let assistantText = '';

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${context.geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: context.systemInstruction }],
          },
          contents: context.messages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          tools: [{ googleSearch: {} }],
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 1100,
          },
        }),
      },
    );

    if (!geminiResponse.ok || !geminiResponse.body) {
      const errorText = await geminiResponse.text();
      send({ type: 'error', message: `Gemini error: ${errorText}` });
      send({ type: 'done' });
      return res.end();
    }

    const reader = geminiResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split('\n');
      buffer = parts.pop() || '';

      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;

        try {
          const json = JSON.parse(payload);
          const text =
            json?.candidates?.[0]?.content?.parts
              ?.map((p: { text?: string }) => p.text || '')
              .join('') || '';
          if (text) {
            assistantText += text;
            send({ type: 'chunk', text });
          }
        } catch {
          // Ignore malformed streaming fragments
        }
      }
    }

    await this.aiService.saveExchange(
      conversation.id,
      context.lastUserMessage,
      assistantText,
      context.matchedContacts,
    );

    send({ type: 'done' });
    return res.end();
  }
}

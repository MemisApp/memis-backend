import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { ThreadsModule } from './modules/threads/threads.module';
import { MessagesModule } from './modules/messages/messages.module';
import { PatientsModule } from './modules/patients/patients.module';
import { PairingCodesModule } from './modules/pairing-codes/pairing-codes.module';
import { DevicesModule } from './modules/devices/devices.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { AdminModule } from './modules/admin/admin.module';
import { AiModule } from './modules/ai/ai.module';
import { ClinicalModule } from './modules/clinical/clinical.module';
import { BillingModule } from './modules/billing/billing.module';
import { CareModule } from './modules/care/care.module';
import { ChatModule } from './modules/chat/chat.module';
import { InvitesModule } from './modules/invites/invites.module';
import { MailModule } from './common/mail/mail.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Enables @Cron jobs (server-side reminder push + inactivity watchdog).
    ScheduleModule.forRoot(),
    // Global rate limiting: 100 requests / minute per IP by default. Sensitive
    // routes (auth, password reset) can tighten this with @Throttle().
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 100 },
    ]),
    PrismaModule,
    CommonModule,
    MailModule,
    AuthModule,
    RoomsModule,
    ThreadsModule,
    MessagesModule,
    PatientsModule,
    PairingCodesModule,
    DevicesModule,
    RemindersModule,
    ContactsModule,
    AdminModule,
    AiModule,
    ClinicalModule,
    BillingModule,
    CareModule,
    ChatModule,
    InvitesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

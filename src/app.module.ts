import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CommonModule,
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

import {
  PrismaClient,
  Role,
  RoomMemberRole,
  RoomVisibility,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // users
  const password = 'Memis123!';
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@memis.dev' },
    update: {},
    create: {
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@memis.dev',
      passwordHash,
      role: Role.ADMIN,
    },
  });

  const caregiver = await prisma.user.upsert({
    where: { email: 'caregiver.demo@memis.dev' },
    update: {},
    create: {
      firstName: 'Care',
      lastName: 'Giver',
      email: 'caregiver.demo@memis.dev',
      passwordHash,
      role: Role.CAREGIVER,
    },
  });

  // a room created by caregiver
  const room = await prisma.room.create({
    data: {
      name: 'Family Room',
      visibility: RoomVisibility.PRIVATE,
      createdById: caregiver.id,
      members: {
        create: [
          { userId: caregiver.id, role: RoomMemberRole.OWNER },
          { userId: admin.id, role: RoomMemberRole.MODERATOR },
        ],
      },
    },
  });

  // a thread in that room
  const thread = await prisma.thread.create({
    data: {
      roomId: room.id,
      title: 'Medication Plan',
      createdById: caregiver.id,
    },
  });

  // a couple of messages
  await prisma.message.createMany({
    data: [
      {
        threadId: thread.id,
        authorId: caregiver.id,
        content: 'Take pills at 20:00.',
      },
      {
        threadId: thread.id,
        authorId: admin.id,
        content: 'Got it. I will remind.',
      },
    ],
  });

  console.log('Seeded:');
  console.log({
    admin: admin.email,
    caregiver: caregiver.email,
    password,
    roomId: room.id,
    threadId: thread.id,
  });
}

main().then(() => prisma.$disconnect());

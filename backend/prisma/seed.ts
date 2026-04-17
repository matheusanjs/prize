import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ===== USERS =====
  const passwordHash = await bcrypt.hash('Admin@123', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@prizeclube.com.br' },
    update: {},
    create: {
      email: 'admin@prizeclube.com.br',
      name: 'Administrador',
      phone: '11999990000',
      cpfCnpj: '00000000000',
      passwordHash,
      role: 'ADMIN',
      isActive: true,
      emailVerified: true,
    },
  });

  const operator = await prisma.user.upsert({
    where: { email: 'operador@prizeclube.com.br' },
    update: {},
    create: {
      email: 'operador@prizeclube.com.br',
      name: 'Carlos Operador',
      phone: '11999991111',
      cpfCnpj: '11111111111',
      passwordHash,
      role: 'OPERATOR',
      isActive: true,
      emailVerified: true,
    },
  });

  const client1 = await prisma.user.upsert({
    where: { email: 'joao@email.com' },
    update: {},
    create: {
      email: 'joao@email.com',
      name: 'João Silva',
      phone: '11988881111',
      cpfCnpj: '22222222222',
      passwordHash,
      role: 'CLIENT',
      isActive: true,
    },
  });

  const client2 = await prisma.user.upsert({
    where: { email: 'ana@email.com' },
    update: {},
    create: {
      email: 'ana@email.com',
      name: 'Ana Oliveira',
      phone: '11988882222',
      cpfCnpj: '33333333333',
      passwordHash,
      role: 'CLIENT',
      isActive: true,
    },
  });

  const client3 = await prisma.user.upsert({
    where: { email: 'roberto@email.com' },
    update: {},
    create: {
      email: 'roberto@email.com',
      name: 'Roberto Lima',
      phone: '11988883333',
      cpfCnpj: '44444444444',
      passwordHash,
      role: 'CLIENT',
      isActive: true,
    },
  });

  console.log('✅ Users created');

  // ===== BOATS =====
  const boat1 = await prisma.boat.upsert({
    where: { registration: 'BR-SP-00101' },
    update: {},
    create: {
      name: 'Wave Runner Pro',
      model: 'Yamaha VX Cruiser HO',
      year: 2024,
      registration: 'BR-SP-00101',
      capacity: 3,
      fuelType: 'GASOLINE',
      fuelCapacity: 70,
      currentFuel: 45,
      hourMeter: 120.5,
      status: 'AVAILABLE',
      totalShares: 4,
      monthlyFee: 4800,
      locationBerth: 'Berço 01 — Pier A',
      imageUrl: '/uploads/boats/wave-runner-pro.jpg',
    },
  });

  const boat2 = await prisma.boat.upsert({
    where: { registration: 'BR-SP-00102' },
    update: {},
    create: {
      name: 'Sea Phantom',
      model: 'Sea-Doo GTI SE 170',
      year: 2025,
      registration: 'BR-SP-00102',
      capacity: 3,
      fuelType: 'GASOLINE',
      fuelCapacity: 60,
      currentFuel: 30,
      hourMeter: 85.2,
      status: 'AVAILABLE',
      totalShares: 4,
      monthlyFee: 5200,
      locationBerth: 'Berço 02 — Pier A',
      imageUrl: '/uploads/boats/sea-phantom.jpg',
    },
  });

  const boat3 = await prisma.boat.upsert({
    where: { registration: 'BR-SP-00103' },
    update: {},
    create: {
      name: 'Thunder Jet',
      model: 'Yamaha FX SVHO',
      year: 2024,
      registration: 'BR-SP-00103',
      capacity: 3,
      fuelType: 'GASOLINE',
      fuelCapacity: 70,
      currentFuel: 55,
      hourMeter: 200.0,
      status: 'AVAILABLE',
      totalShares: 4,
      monthlyFee: 6000,
      locationBerth: 'Berço 03 — Pier B',
      imageUrl: '/uploads/boats/thunder-jet.jpg',
    },
  });

  console.log('✅ Boats created');

  // ===== SHARES =====
  await prisma.share.createMany({
    skipDuplicates: true,
    data: [
      {
        boatId: boat1.id,
        userId: client1.id,
        sharePercentage: 25,
        shareNumber: 1,
        monthlyValue: 1200,
        startDate: new Date('2026-01-01'),
        isActive: true,
      },
      {
        boatId: boat1.id,
        userId: client2.id,
        sharePercentage: 25,
        shareNumber: 2,
        monthlyValue: 1200,
        startDate: new Date('2026-01-01'),
        isActive: true,
      },
      {
        boatId: boat2.id,
        userId: client1.id,
        sharePercentage: 25,
        shareNumber: 1,
        monthlyValue: 1300,
        startDate: new Date('2026-02-01'),
        isActive: true,
      },
      {
        boatId: boat2.id,
        userId: client3.id,
        sharePercentage: 25,
        shareNumber: 2,
        monthlyValue: 1300,
        startDate: new Date('2026-02-01'),
        isActive: true,
      },
      {
        boatId: boat3.id,
        userId: client2.id,
        sharePercentage: 25,
        shareNumber: 1,
        monthlyValue: 1500,
        startDate: new Date('2026-03-01'),
        isActive: true,
      },
    ],
  });

  console.log('✅ Shares created');

  // ===== RESERVATIONS =====
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);

  await prisma.reservation.createMany({
    data: [
      {
        boatId: boat1.id,
        userId: client1.id,
        startDate: tomorrow,
        endDate: new Date(tomorrow.getTime() + 8 * 60 * 60 * 1000),
        status: 'CONFIRMED',
        notes: 'Passeio familiar',
      },
      {
        boatId: boat2.id,
        userId: client3.id,
        startDate: nextWeek,
        endDate: new Date(nextWeek.getTime() + 10 * 60 * 60 * 1000),
        status: 'CONFIRMED',
      },
    ],
  });

  console.log('✅ Reservations created');

  // ===== CHARGES =====
  const dueDate = new Date(now.getFullYear(), now.getMonth(), 5);
  const pastDue = new Date(now.getFullYear(), now.getMonth() - 1, 5);

  await prisma.charge.createMany({
    data: [
      {
        userId: client1.id,
        description: 'Mensalidade Abril — Wave Runner Pro (Cota 1)',
        amount: 1200,
        dueDate,
        category: 'MONTHLY_FEE',
        boatId: boat1.id,
        status: 'PENDING',
      },
      {
        userId: client2.id,
        description: 'Mensalidade Abril — Wave Runner Pro (Cota 2)',
        amount: 1200,
        dueDate,
        category: 'MONTHLY_FEE',
        boatId: boat1.id,
        status: 'PAID',
        paidAt: new Date(),
      },
      {
        userId: client1.id,
        description: 'Mensalidade Março — Wave Runner Pro (Cota 1)',
        amount: 1200,
        dueDate: pastDue,
        category: 'MONTHLY_FEE',
        boatId: boat1.id,
        status: 'PAID',
        paidAt: new Date(pastDue.getTime() + 3 * 24 * 60 * 60 * 1000),
      },
      {
        userId: client3.id,
        description: 'Combustível — Sea Phantom (40L)',
        amount: 280,
        dueDate,
        category: 'FUEL',
        boatId: boat2.id,
        status: 'PENDING',
      },
    ],
  });

  console.log('✅ Charges created');

  // ===== FUEL LOGS =====
  await prisma.fuelLog.createMany({
    data: [
      {
        boatId: boat1.id,
        operatorId: operator.id,
        liters: 45,
        pricePerLiter: 6.89,
        totalCost: 310.05,
        fuelType: 'GASOLINE',
        hourMeter: 120.5,
      },
      {
        boatId: boat2.id,
        operatorId: operator.id,
        liters: 40,
        pricePerLiter: 7.00,
        totalCost: 280.00,
        fuelType: 'GASOLINE',
        hourMeter: 85.2,
      },
    ],
  });

  console.log('✅ Fuel logs created');

  // ===== NOTIFICATIONS =====
  await prisma.notification.createMany({
    data: [
      {
        userId: client1.id,
        type: 'RESERVATION',
        title: 'Reserva confirmada',
        body: 'Sua reserva do Wave Runner Pro para amanhã foi confirmada!',
      },
      {
        userId: client1.id,
        type: 'PAYMENT',
        title: 'Cobrança gerada',
        body: 'Mensalidade de Abril — R$ 1.200,00 — vence em 05/04',
      },
      {
        userId: admin.id,
        type: 'GENERAL',
        title: 'Bem-vindo ao Prize Clube',
        body: 'Painel administrativo configurado com sucesso!',
      },
    ],
  });

  console.log('✅ Notifications created');
  console.log('🎉 Seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

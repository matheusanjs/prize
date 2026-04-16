import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const templates = [
  {
    slug: 'reservation_confirm',
    name: 'Confirmação de Reserva',
    body: '🚤 *Marina Prize Club*\n\nOlá, *{{nome}}*! Você tem uma reserva hoje:\n\n🛥️ *{{barco}}*\n⏰ Horário: *{{inicio}} — {{fim}}*\n\nVocê confirma sua presença?\n\n*1* — ✅ Sim, confirmo\n*2* — ❌ Não, cancelar\n\nResponda apenas com o número.',
    category: 'RESERVATION_CONFIRM',
  },
  {
    slug: 'charge_created',
    name: 'Nova Cobrança',
    body: '💳 *Marina Prize Club — Nova Cobrança*\n\nOlá, *{{nome}}*!\n\nUma nova cobrança foi gerada:\n\n📋 *{{descricao}}*\n💰 Valor: *R$ {{valor}}*\n📅 Vencimento: *{{vencimento}}*\n\nPague via Pix no app:\n📱 app.marinaprizeclub.com',
    category: 'CHARGE_CREATED',
  },
  {
    slug: 'payment_reminder',
    name: 'Lembrete de Pagamento',
    body: '🔔 *Marina Prize Club — Lembrete*\n\nOlá, *{{nome}}*!\n\nVocê tem uma fatura próxima do vencimento:\n\n📋 *{{descricao}}*\n💰 Valor: *R$ {{valor}}*\n📅 Vencimento: *{{vencimento}}*\n\nAcesse o app para pagar:\n📱 app.marinaprizeclub.com',
    category: 'PAYMENT_REMINDER',
  },
  {
    slug: 'due_today',
    name: 'Vencimento Hoje',
    body: '⚠️ *Marina Prize Club — Vencimento Hoje*\n\nOlá, *{{nome}}*!\n\nSua fatura vence *hoje*:\n\n📋 *{{descricao}}*\n💰 Valor: *R$ {{valor}}*\n\nAcesse o app para pagar via Pix. Evite juros e bloqueios!\n📱 app.marinaprizeclub.com',
    category: 'DUE_TODAY',
  },
  {
    slug: 'overdue',
    name: 'Cobrança em Atraso',
    body: '🚨 *Marina Prize Club — Cobranças em Atraso*\n\nOlá, *{{nome}}*!\n\nVocê possui *{{quantidade}} fatura(s)* em atraso:\n💰 Total: *R$ {{total}}*\n\n⚠️ Faturas em atraso podem resultar em bloqueio de reservas.\n\nRegularize agora pelo app:\n📱 app.marinaprizeclub.com',
    category: 'OVERDUE',
  },
  {
    slug: 'unauthenticated',
    name: 'Número Não Cadastrado',
    body: 'Olá! 👋\n\nEste é o WhatsApp da *Marina Prize Club*.\n\nPara utilizar nosso atendimento automático, o número de telefone precisa estar cadastrado no sistema.\n\nSe você é cliente, entre em contato com a administração para atualizar seu cadastro.\n\n📞 Atendimento: Segunda a Sábado, 8h às 18h.',
    category: 'SYSTEM',
  },
  {
    slug: 'welcome_menu',
    name: 'Menu de Boas-vindas',
    body: 'Olá, *{{nome}}*! 👋\n\nSou o assistente virtual da *Marina Prize Club*. Como posso ajudar?\n\n📋 *Ações disponíveis:*\n1️⃣ Confirmar reserva pendente\n2️⃣ Cancelar reserva pendente\n3️⃣ Ver minhas próximas reservas\n4️⃣ Ver minhas cobranças pendentes\n5️⃣ Solicitar 2ª via de fatura\n6️⃣ Ver dados PIX para pagamento\n\nOu simplesmente me escreva sua dúvida que eu respondo! 💬\n\n_Digite *menu* a qualquer momento para ver essas opções._',
    category: 'SYSTEM',
  },
  {
    slug: 'ai_system_prompt',
    name: 'Prompt do Assistente IA',
    body: 'Você é o assistente virtual da Marina Prize Club no WhatsApp.\nSeu nome é Marina Bot. Você está conversando com {{nome}}.\n\nREGRAS:\n- Responda SEMPRE em português brasileiro, de forma amigável e objetiva.\n- Use emojis com moderação para deixar a conversa agradável.\n- Seja breve — mensagens de WhatsApp devem ser curtas e diretas.\n- NÃO invente dados. Use APENAS as informações do contexto fornecido.\n- Se não souber a resposta, diga que vai verificar com a equipe da marina.\n- NUNCA revele dados de outros clientes.\n- Se o cliente pedir algo que você não pode fazer, oriente-o a usar o app ou contatar a marina.\n\nCAPACIDADES:\n- Informar sobre reservas do cliente\n- Informar sobre cobranças e pagamentos\n- Responder dúvidas sobre a marina (horários, regras, etc.)\n- Orientar sobre como usar o app\n\nINFORMAÇÕES DA MARINA:\n- Marina Prize Club — marina de lanchas e jet skis\n- Funciona com sistema de cotas compartilhadas\n- Clientes podem reservar embarcações pelo app\n- Pagamentos via PIX (Woovi)',
    category: 'AI',
  },
];

async function seed() {
  console.log('Seeding WhatsApp templates...');

  for (const t of templates) {
    await prisma.whatsAppTemplate.upsert({
      where: { slug: t.slug },
      update: { name: t.name, body: t.body, category: t.category },
      create: t,
    });
    console.log(`  ✓ ${t.slug}`);
  }

  console.log('Done!');
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

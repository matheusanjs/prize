import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

export const metadata: Metadata = {
  title: 'Exclusão de Dados | Marina Prize Club',
  description: 'Solicite a exclusão dos seus dados pessoais da Marina Prize Club.',
};

export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-secondary-900 text-foreground">
      {/* Header */}
      <header className="border-b border-foreground/[0.06]">
        <div className="max-w-4xl mx-auto px-5 sm:px-6 py-5 flex items-center justify-between">
          <Link href="/">
            <Image src="/logo.png" alt="Prize Club" width={120} height={40} className="h-7 w-auto dark:brightness-0 dark:invert" />
          </Link>
          <Link href="/" className="text-sm text-primary-400 hover:text-primary-300 transition-colors">
            ← Voltar
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-5 sm:px-6 py-10 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Exclusão de Dados</h1>
        <p className="text-foreground/40 text-sm mb-10">Solicite a remoção dos seus dados pessoais</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-foreground/70 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">Seu Direito à Exclusão</h2>
            <p>
              De acordo com a Lei Geral de Proteção de Dados (LGPD), você tem o direito de solicitar a exclusão 
              dos seus dados pessoais armazenados pela Marina Prize Club. Levamos este direito a sério e 
              processaremos sua solicitação o mais rápido possível.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">Como Solicitar a Exclusão</h2>
            <p>Para solicitar a exclusão dos seus dados, envie um e-mail para:</p>
            <div className="mt-4 p-5 bg-foreground/[0.04] border border-foreground/[0.08] rounded-xl">
              <p className="text-lg font-medium text-foreground">
                <a href="mailto:contato@marinaprizeclub.com.br?subject=Solicita%C3%A7%C3%A3o%20de%20Exclus%C3%A3o%20de%20Dados" 
                   className="text-primary-400 hover:text-primary-300 transition-colors">
                  contato@marinaprizeclub.com.br
                </a>
              </p>
              <p className="text-sm text-foreground/50 mt-2">Assunto: Solicitação de Exclusão de Dados</p>
            </div>
            <p className="mt-4">No e-mail, inclua:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Seu nome completo (conforme cadastro)</li>
              <li>E-mail associado à sua conta</li>
              <li>CPF (para verificação de identidade)</li>
              <li>Descrição da solicitação (exclusão parcial ou total dos dados)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">O que Será Excluído</h2>
            <p>Ao solicitar a exclusão total, removeremos:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Dados de perfil (nome, e-mail, telefone, foto)</li>
              <li>Histórico de reservas</li>
              <li>Histórico de pedidos de gastronomia</li>
              <li>Registros de abastecimento</li>
              <li>Tokens de notificação push</li>
              <li>Preferências e configurações</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">Dados que Podem Ser Retidos</h2>
            <p>
              Alguns dados podem ser retidos mesmo após a exclusão da conta, quando necessário para:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Obrigações legais e fiscais:</strong> registros financeiros devem ser mantidos conforme legislação tributária (até 5 anos)</li>
              <li><strong>Contratos vigentes:</strong> dados vinculados a contratos de cotas ativos até sua finalização</li>
              <li><strong>Débitos pendentes:</strong> registros de cobranças em aberto até sua quitação</li>
              <li><strong>Exercício de direitos:</strong> dados necessários para defesa em processos judiciais</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">Prazo de Processamento</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Confirmaremos o recebimento da sua solicitação em até <strong>2 dias úteis</strong>.</li>
              <li>A exclusão será processada em até <strong>15 dias úteis</strong> após a confirmação da identidade.</li>
              <li>Você receberá uma confirmação por e-mail quando o processo for concluído.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">Consequências da Exclusão</h2>
            <p>Ao excluir sua conta e dados:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Você perderá acesso ao App e a todos os serviços associados</li>
              <li>Reservas futuras serão canceladas</li>
              <li>O processo é <strong>irreversível</strong> — uma nova conta precisará ser criada caso deseje utilizar os serviços novamente</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">Contato</h2>
            <p>Dúvidas sobre exclusão de dados:</p>
            <ul className="list-none space-y-1 mt-3">
              <li><strong>E-mail:</strong>{' '}
                <a href="mailto:contato@marinaprizeclub.com.br" className="text-primary-400 hover:text-primary-300">
                  contato@marinaprizeclub.com.br
                </a>
              </li>
              <li><strong>Telefone:</strong> (22) 98158-1555</li>
              <li><strong>Endereço:</strong> Rua dos Camarões, 117 - Ogiva, Cabo Frio - RJ</li>
            </ul>
            <p className="mt-4">
              Consulte também nossa{' '}
              <Link href="/privacidade" className="text-primary-400 hover:text-primary-300">
                Política de Privacidade
              </Link>{' '}
              para mais informações sobre o tratamento dos seus dados.
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-foreground/[0.06] py-6 text-center">
        <p className="text-xs text-foreground/25">
          © {new Date().getFullYear()} Marina Prize Club. Todos os direitos reservados.
        </p>
      </footer>
    </div>
  );
}

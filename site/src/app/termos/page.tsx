import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

export const metadata: Metadata = {
  title: 'Termos de Uso | Marina Prize Club',
  description: 'Termos de Uso da Marina Prize Club - Condições gerais de utilização dos nossos serviços.',
};

export default function TermsPage() {
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
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Termos de Uso</h1>
        <p className="text-foreground/40 text-sm mb-10">Última atualização: 16 de abril de 2026</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-foreground/70 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">1. Aceitação dos Termos</h2>
            <p>
              Ao acessar ou utilizar o aplicativo Marina Prize Club (&quot;App&quot;) e/ou o site marinaprizeclub.com (&quot;Site&quot;), 
              você concorda com estes Termos de Uso. Se você não concordar com qualquer parte destes termos, 
              não utilize nossos serviços.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">2. Descrição dos Serviços</h2>
            <p>A Marina Prize Club oferece uma plataforma digital para gestão de serviços náuticos, incluindo:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Sistema de cotas compartilhadas de embarcações (jet skis e lanchas)</li>
              <li>Reserva e agendamento de embarcações</li>
              <li>Gestão de guardaria e vagas</li>
              <li>Pedidos de gastronomia e bar</li>
              <li>Controle de abastecimento de combustível</li>
              <li>Gestão financeira (cobranças e pagamentos)</li>
              <li>Solicitações de manutenção</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">3. Cadastro e Conta</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Para utilizar o App, é necessário criar uma conta fornecendo informações verdadeiras e completas.</li>
              <li>Você é responsável por manter a confidencialidade de suas credenciais de acesso (e-mail e senha).</li>
              <li>Toda atividade realizada em sua conta é de sua responsabilidade.</li>
              <li>Você deve notificar imediatamente a Marina Prize Club sobre qualquer uso não autorizado de sua conta.</li>
              <li>Nos reservamos o direito de suspender ou cancelar contas que violem estes termos.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">4. Cotas de Embarcações</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>As cotas de embarcações são regidas por contrato específico entre o cotista e a Marina Prize Club.</li>
              <li>O uso das embarcações deve seguir as regras de reserva e disponibilidade estabelecidas na plataforma.</li>
              <li>O cotista deve respeitar os horários de reserva e devolver a embarcação no prazo acordado.</li>
              <li>Danos causados por mau uso são de responsabilidade do cotista, conforme contrato.</li>
              <li>O abastecimento de combustível será registrado e cobrado conforme o uso individual.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">5. Reservas</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>As reservas estão sujeitas à disponibilidade e podem ser confirmadas ou recusadas pela marina.</li>
              <li>Cancelamentos devem ser feitos com antecedência mínima conforme regras da marina.</li>
              <li>No-shows (não comparecimento) podem resultar em penalidades conforme política da marina.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">6. Gastronomia e Pedidos</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Pedidos de gastronomia realizados pelo App estão sujeitos à disponibilidade do cardápio.</li>
              <li>Preços podem ser alterados sem aviso prévio.</li>
              <li>O consumo será adicionado à conta do membro e cobrado conforme política financeira da marina.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">7. Pagamentos e Cobranças</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>As cobranças são geradas conforme os serviços utilizados e contratos vigentes.</li>
              <li>O atraso no pagamento pode resultar em juros, multa e restrição de acesso aos serviços.</li>
              <li>Contestações de cobranças devem ser realizadas em até 5 dias úteis após a emissão.</li>
              <li>A Marina Prize Club se reserva o direito de suspender serviços em caso de inadimplência.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">8. Notificações</h2>
            <p>
              Ao utilizar o App, você concorda em receber notificações push relacionadas aos serviços contratados, 
              incluindo alertas de reservas, cobranças, pedidos e atualizações operacionais. Você pode desativar 
              essas notificações nas configurações do seu dispositivo a qualquer momento.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">9. Propriedade Intelectual</h2>
            <p>
              Todo o conteúdo do App e do Site, incluindo textos, imagens, logotipos, design e software, 
              é propriedade da Marina Prize Club ou de seus licenciadores e está protegido por leis de 
              propriedade intelectual. É proibida a reprodução, distribuição ou modificação sem autorização prévia.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">10. Limitação de Responsabilidade</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>O App é fornecido &quot;como está&quot;. Não garantimos disponibilidade ininterrupta ou livre de erros.</li>
              <li>Não somos responsáveis por danos indiretos, incidentais ou consequenciais decorrentes do uso do App.</li>
              <li>A responsabilidade da Marina Prize Club é limitada ao valor dos serviços efetivamente contratados.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">11. Conduta do Usuário</h2>
            <p>Ao utilizar nossos serviços, você se compromete a:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Não utilizar o App para fins ilegais ou não autorizados</li>
              <li>Não tentar acessar áreas restritas do sistema</li>
              <li>Não compartilhar sua conta com terceiros</li>
              <li>Respeitar as regras de uso das instalações e embarcações da marina</li>
              <li>Tratar funcionários e demais membros com respeito</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">12. Encerramento de Conta</h2>
            <p>
              Você pode solicitar o encerramento de sua conta a qualquer momento através da página de{' '}
              <Link href="/exclusao-de-dados" className="text-primary-400 hover:text-primary-300">
                Exclusão de Dados
              </Link>{' '}
              ou entrando em contato pelo e-mail{' '}
              <a href="mailto:contato@marinaprizeclub.com.br" className="text-primary-400 hover:text-primary-300">
                contato@marinaprizeclub.com.br
              </a>.
              O encerramento está sujeito à quitação de débitos pendentes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">13. Alterações nos Termos</h2>
            <p>
              A Marina Prize Club pode alterar estes Termos de Uso a qualquer momento. Alterações significativas serão 
              comunicadas pelo App ou por e-mail. O uso continuado dos serviços após a publicação de alterações 
              constitui aceitação dos novos termos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">14. Legislação Aplicável</h2>
            <p>
              Estes Termos de Uso são regidos pelas leis da República Federativa do Brasil. Qualquer controvérsia 
              será submetida ao foro da comarca de Cabo Frio - RJ, com exclusão de qualquer outro, por mais privilegiado 
              que seja.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">15. Contato</h2>
            <p>Para dúvidas sobre estes Termos de Uso:</p>
            <ul className="list-none space-y-1 mt-3">
              <li><strong>E-mail:</strong>{' '}
                <a href="mailto:contato@marinaprizeclub.com.br" className="text-primary-400 hover:text-primary-300">
                  contato@marinaprizeclub.com.br
                </a>
              </li>
              <li><strong>Telefone:</strong> (22) 98158-1555</li>
              <li><strong>Endereço:</strong> Rua dos Camarões, 117 - Ogiva, Cabo Frio - RJ</li>
            </ul>
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

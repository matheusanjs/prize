import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

export const metadata: Metadata = {
  title: 'Política de Privacidade | Marina Prize Club',
  description: 'Política de Privacidade da Marina Prize Club - Saiba como coletamos, usamos e protegemos seus dados.',
};

export default function PrivacyPage() {
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
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Política de Privacidade</h1>
        <p className="text-foreground/40 text-sm mb-10">Última atualização: 16 de abril de 2026</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-foreground/70 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">1. Introdução</h2>
            <p>
              A <strong>Marina Prize Club</strong> (&quot;nós&quot;, &quot;nosso&quot; ou &quot;Empresa&quot;), inscrita no CNPJ sob o nº XX.XXX.XXX/0001-XX, 
              com sede na Rua dos Camarões, 117 - Ogiva, Cabo Frio - RJ, é a controladora dos dados pessoais coletados por meio 
              do aplicativo Marina Prize Club (&quot;App&quot;) e do site marinaprizeclub.com (&quot;Site&quot;).
            </p>
            <p>
              Esta Política de Privacidade descreve como coletamos, utilizamos, armazenamos e compartilhamos seus dados pessoais, 
              em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018) e demais legislações aplicáveis.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">2. Dados que Coletamos</h2>
            <p>Podemos coletar os seguintes tipos de dados pessoais:</p>
            <h3 className="text-base font-medium text-foreground/80 mt-4 mb-2">2.1 Dados de Cadastro</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Nome completo</li>
              <li>Endereço de e-mail</li>
              <li>Número de telefone/WhatsApp</li>
              <li>CPF (quando necessário para cotas e contratos)</li>
              <li>Foto de perfil (opcional)</li>
            </ul>
            <h3 className="text-base font-medium text-foreground/80 mt-4 mb-2">2.2 Dados de Uso do Serviço</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Reservas de embarcações e histórico de uso</li>
              <li>Pedidos de gastronomia e consumo</li>
              <li>Registros de abastecimento de combustível</li>
              <li>Registros financeiros (cobranças, pagamentos)</li>
              <li>Solicitações de manutenção</li>
            </ul>
            <h3 className="text-base font-medium text-foreground/80 mt-4 mb-2">2.3 Dados Técnicos</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Endereço IP e tipo de navegador</li>
              <li>Sistema operacional e modelo do dispositivo</li>
              <li>Tokens de notificação push (para envio de alertas)</li>
              <li>Dados de cookies essenciais para autenticação</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">3. Como Utilizamos seus Dados</h2>
            <p>Utilizamos seus dados pessoais para as seguintes finalidades:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Prestação de serviços:</strong> gerenciar sua conta, reservas, cotas, pedidos de gastronomia e operações de marina</li>
              <li><strong>Comunicação:</strong> enviar notificações push sobre reservas, cobranças, pedidos e alertas operacionais</li>
              <li><strong>Financeiro:</strong> processar cobranças, emitir recibos e gerenciar pagamentos</li>
              <li><strong>Segurança:</strong> autenticar seu acesso e proteger contra fraudes</li>
              <li><strong>Melhoria do serviço:</strong> analisar padrões de uso para aprimorar a experiência do usuário</li>
              <li><strong>Obrigações legais:</strong> cumprir requisitos regulatórios e fiscais</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">4. Notificações Push</h2>
            <p>
              Nosso aplicativo utiliza notificações push para manter você informado sobre:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Confirmações e lembretes de reservas</li>
              <li>Cobranças vencendo e vencidas</li>
              <li>Status de pedidos de gastronomia</li>
              <li>Alertas de abastecimento e manutenção</li>
              <li>Atualizações operacionais importantes</li>
            </ul>
            <p>
              Você pode desativar as notificações push a qualquer momento nas configurações do seu dispositivo ou navegador. 
              A desativação não afeta o funcionamento das demais funcionalidades do App.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">5. Compartilhamento de Dados</h2>
            <p>Seus dados pessoais <strong>não são vendidos</strong> a terceiros. Podemos compartilhar dados nas seguintes situações:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Prestadores de serviço:</strong> empresas que nos auxiliam na operação (hospedagem de dados, processamento de pagamentos)</li>
              <li><strong>Obrigação legal:</strong> quando exigido por lei, ordem judicial ou autoridade competente</li>
              <li><strong>Proteção de direitos:</strong> para proteger nossos direitos, segurança ou propriedade</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">6. Armazenamento e Segurança</h2>
            <p>
              Seus dados são armazenados em servidores seguros com criptografia em trânsito (TLS/SSL) e em repouso. 
              Adotamos medidas técnicas e organizacionais apropriadas para proteger seus dados contra acesso não autorizado, 
              alteração, divulgação ou destruição.
            </p>
            <p>
              Os dados são mantidos pelo período necessário para cumprir as finalidades descritas nesta política ou conforme 
              exigido por lei.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">7. Seus Direitos (LGPD)</h2>
            <p>De acordo com a LGPD, você tem direito a:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Confirmação e acesso:</strong> saber se tratamos seus dados e acessá-los</li>
              <li><strong>Correção:</strong> solicitar a correção de dados incompletos ou desatualizados</li>
              <li><strong>Anonimização ou eliminação:</strong> solicitar a anonimização ou exclusão de dados desnecessários</li>
              <li><strong>Portabilidade:</strong> solicitar a transferência de seus dados a outro fornecedor</li>
              <li><strong>Revogação do consentimento:</strong> retirar o consentimento a qualquer momento</li>
              <li><strong>Eliminação:</strong> solicitar a exclusão dos dados tratados com base em consentimento</li>
              <li><strong>Exclusão de conta:</strong> solicitar a exclusão completa de sua conta e dados associados</li>
            </ul>
            <p>
              Para exercer qualquer desses direitos, entre em contato pelo e-mail{' '}
              <a href="mailto:contato@marinaprizeclub.com.br" className="text-primary-400 hover:text-primary-300">
                contato@marinaprizeclub.com.br
              </a>{' '}
              ou pela página de{' '}
              <Link href="/exclusao-de-dados" className="text-primary-400 hover:text-primary-300">
                Exclusão de Dados
              </Link>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">8. Cookies</h2>
            <p>
              Utilizamos apenas cookies essenciais para autenticação e funcionamento do aplicativo. 
              Não utilizamos cookies de rastreamento ou publicidade de terceiros.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">9. Menores de Idade</h2>
            <p>
              Nossos serviços não são destinados a menores de 18 anos. Não coletamos intencionalmente dados de menores. 
              Caso tome conhecimento de que um menor forneceu dados pessoais, entre em contato conosco para que possamos 
              tomar as providências necessárias.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">10. Alterações nesta Política</h2>
            <p>
              Podemos atualizar esta Política de Privacidade periodicamente. Notificaremos sobre mudanças significativas 
              por meio do App ou por e-mail. A data da última atualização será sempre indicada no topo desta página.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">11. Contato</h2>
            <p>
              Para dúvidas, solicitações ou reclamações relacionadas a esta política ou ao tratamento de seus dados pessoais, 
              entre em contato conosco:
            </p>
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

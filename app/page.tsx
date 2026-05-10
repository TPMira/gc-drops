import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <h1 className="text-4xl sm:text-6xl font-bold text-white mb-6">
              🎮 Grand Chase
              <span className="block text-blue-400">Drops Tracker</span>
            </h1>

            <p className="text-xl sm:text-2xl text-gray-300 mb-8 max-w-3xl mx-auto">
              Acompanhe, analise e otimize seus drops de itens no Grand Chase.
              Registre suas runs, gerencie mapas e itens, e veja estatísticas detalhadas.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/runs/new"
                className="inline-flex items-center px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                🚀 Registrar Nova Run
              </Link>

              <Link
                href="/stats"
                className="inline-flex items-center px-8 py-4 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
              >
                📊 Ver Estatísticas
              </Link>
            </div>
          </div>
        </div>

        {/* Background Effects */}
        <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-24 w-[500px] h-[500px] bg-blue-700/10 rounded-full blur-[120px]" />
          <div className="absolute top-1/2 -translate-y-1/2 right-0 w-[400px] h-[400px] bg-indigo-700/8 rounded-full blur-[100px]" />
          <div className="absolute bottom-0 left-1/3 w-[350px] h-[350px] bg-violet-700/8 rounded-full blur-[100px]" />
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white/5">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-white mb-12">
            Funcionalidades Principais
          </h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-white/5 rounded-lg p-6 border border-white/10">
              <div className="text-4xl mb-4">📝</div>
              <h3 className="text-xl font-semibold text-white mb-2">Registro de Runs</h3>
              <p className="text-gray-300">
                Registre facilmente suas runs, marcando quais itens droparam em cada mapa.
                Interface intuitiva com clique nos itens.
              </p>
            </div>

            <div className="bg-white/5 rounded-lg p-6 border border-white/10">
              <div className="text-4xl mb-4">🗺️</div>
              <h3 className="text-xl font-semibold text-white mb-2">Gerenciamento de Mapas</h3>
              <p className="text-gray-300">
                Crie, edite e organize mapas e itens. Configure offsets de runs e drops
                para estatísticas mais precisas.
              </p>
            </div>

            <div className="bg-white/5 rounded-lg p-6 border border-white/10">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-xl font-semibold text-white mb-2">Estatísticas Detalhadas</h3>
              <p className="text-gray-300">
                Visualize taxas de drop por item, rankings de personagens e
                análises completas dos seus dados.
              </p>
            </div>

            <div className="bg-white/5 rounded-lg p-6 border border-white/10">
              <div className="text-4xl mb-4">🏆</div>
              <h3 className="text-xl font-semibold text-white mb-2">Sistema de Ranking</h3>
              <p className="text-gray-300">
                Compare seu desempenho com outros jogadores. Rankings por mapa,
                personagem e tipo de item.
              </p>
            </div>

            <div className="bg-white/5 rounded-lg p-6 border border-white/10">
              <div className="text-4xl mb-4">📈</div>
              <h3 className="text-xl font-semibold text-white mb-2">Tracker em Tempo Real</h3>
              <p className="text-gray-300">
                Acompanhe drops em tempo real através do Discord bot integrado.
                Notificações automáticas de itens raros.
              </p>
            </div>

            <div className="bg-white/5 rounded-lg p-6 border border-white/10">
              <div className="text-4xl mb-4">🔧</div>
              <h3 className="text-xl font-semibold text-white mb-2">Administração Completa</h3>
              <p className="text-gray-300">
                Painel administrativo para gerenciar todo o sistema: mapas, itens,
                usuários e configurações avançadas.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-6">
            Pronto para Otimizar Seus Drops?
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            Comece agora mesmo a registrar suas runs e descobrir padrões nos drops do Grand Chase.
          </p>

          <Link
            href="/runs/new"
            className="inline-flex items-center px-8 py-4 bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-lg transition-all transform hover:scale-105"
          >
            🎯 Começar Agora
          </Link>
        </div>
      </section>
    </div>
  );
}

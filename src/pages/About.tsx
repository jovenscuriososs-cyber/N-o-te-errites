import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Zap, TrendingUp, HelpCircle, Lock, Info, Globe, CheckCircle2 } from 'lucide-react';

export default function About() {
  const navigate = useNavigate();

  const sections = [
    {
      title: "Como Funciona a Arena",
      icon: <Globe className="text-primary" />,
      content: "A Arena LUDO Angola é uma plataforma P2P (Peer-to-Peer) de Ludo competitivo baseada em regras tradicionais. Jogadores de toda Angola podem desafiar-se mutuamente em partidas reais, tanto na modalidade amadora (Grátis) quanto profissional (com apostas reais em Kwanza)."
    },
    {
      title: "Criação de Desafios",
      icon: <Zap className="text-secondary" />,
      content: "Pode criar um desafio público escolhendo o Modo Profissional e definindo o valor de aposta desejado, ou aceitar desafios criados por outros jogadores na lista de espera. O vencedor da partida recebe o prémio acumulado integralmente."
    },
    {
      title: "Depósitos e Levantamentos Reais",
      icon: <TrendingUp className="text-success" />,
      content: "Todos os depósitos são convertidos de forma real através de Vouchers adquiridos diretamente com os nossos agentes autorizados de suporte 24/7. Os levantamentos são 100% reais e processados em segurança via IBAN, Multicaixa Express, Unitel Money ou PayPal Ao no prazo de 2 a 12 horas."
    },
    {
      title: "Regulamento e Penalizações",
      icon: <CheckCircle2 className="text-primary" />,
      content: "Para garantir total justiça, o jogo possui um temporizador estrito de 30 segundos por jogada. Capturar peças de oponentes elimina o peão e força o retorno à base. Fraudes ou abandono de partidas resultam em penalizações e suspensão permanente da conta."
    },
    {
      title: "Segurança de Saldo P2P",
      icon: <Lock className="text-accent" />,
      content: "Utilizamos encriptação segura e conexões diretas ao Firebase Realtime Database. As suas credenciais, transações financeiras e histórico de jogos são protegidos com total privacidade e monitorização contínua contra bots ou manipulações."
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="px-4 pt-8 pb-24 min-h-screen text-foreground"
    >
      <header className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate(-1)} className="w-10 h-10 glass rounded-full flex items-center justify-center">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-md font-black uppercase tracking-widest text-primary">Sobre a Arena</h1>
          <p className="text-[10px] opacity-80 uppercase font-bold tracking-wider">Regulamento & Informações</p>
        </div>
      </header>

      <div className="space-y-6">
        <div className="glass p-6 rounded-[2.5rem] bg-primary/5 border-primary/20 text-center mb-8">
          <h2 className="text-2xl font-black mb-2 uppercase tracking-tight text-primary">LUDO ARENA ANGOLA</h2>
          <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Plataforma P2P Profissional e 100% Real</p>
        </div>

        {sections.map((section, idx) => (
          <motion.section
            key={idx}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: idx * 0.1 }}
            className="glass p-6 rounded-3xl border-adaptive"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                {section.icon}
              </div>
              <h3 className="text-sm font-black uppercase tracking-widest text-foreground">{section.title}</h3>
            </div>
            <p className="text-xs font-bold opacity-85 leading-relaxed">
              {section.content}
            </p>
          </motion.section>
        ))}

        <section className="glass p-6 rounded-3xl border-primary/20 bg-primary/5">
          <div className="flex items-center gap-3 mb-4">
            <Info className="text-primary" />
            <h3 className="text-sm font-black uppercase tracking-widest text-foreground font-sans">Direitos Autorais</h3>
          </div>
          <p className="text-[10px] font-bold opacity-80 uppercase leading-relaxed">
            © 2026 Arena LUDO P2P Angola. Todos os direitos reservados. Qualquer tentativa de fraude de saldos ou manipulação de rede será sancionada legalmente.
          </p>
        </section>

        <div className="p-8 text-center opacity-70">
          <HelpCircle size={48} className="mx-auto mb-4 text-primary" />
          <p className="text-[10px] font-black uppercase tracking-widest text-foreground">Dúvidas? Contacte o suporte oficial via chat privado.</p>
        </div>
      </div>
    </motion.div>
  );
}

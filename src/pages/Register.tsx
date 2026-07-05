import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, User, Phone, MapPin, Lock, ArrowRight, Camera, Upload, Check, HelpCircle, CheckCircle } from 'lucide-react';
import { db } from '../firebase';
import { useRenewStore } from '../store/useStore';
import { ref, get, set } from 'firebase/database';

export const PROVINCES = [
  'Bengo',
  'Benguela',
  'Bié',
  'Cabinda',
  'Cuando Cubango',
  'Cuanza Norte',
  'Cuanza Sul',
  'Cunene',
  'Huambo',
  'Huíla',
  'Luanda',
  'Lunda Norte',
  'Lunda Sul',
  'Malanje',
  'Moxico',
  'Namibe',
  'Uíge',
  'Zaire'
];

const AVATAR_PRESETS = [
  { id: 'pres_lion', char: '🦁', name: 'Leão da Lunda' },
  { id: 'pres_eagle', char: '🦅', name: 'Águia Real' },
  { id: 'pres_fire', char: '🔥', name: 'Fogo Pro' },
  { id: 'pres_gem', char: '💎', name: 'Diamante' },
  { id: 'pres_crown', char: '👑', name: 'Rei do Ludo' },
  { id: 'pres_star', char: '⭐', name: 'Estrela' }
];

interface QuizQuestion {
  id: number;
  text: string;
  options: string[];
  correct: number;
}

const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    text: "Quantas peças (peões) cada jogador possui no tabuleiro na nossa plataforma?",
    options: ["4 peças por jogador", "2 peças por jogador", "1 peça por jogador"],
    correct: 1 // 2 peças por jogador (updated in previous edit)
  },
  {
    id: 2,
    text: "Qual é o número necessário nos dados para tirar uma peça da base para a partida?",
    options: ["Número 1 nos dados", "Número 3 nos dados", "Número 6 nos dados"],
    correct: 2 // Número 6
  },
  {
    id: 3,
    text: "O que acontece ao calhar exatamente na mesma casa de uma peça adversária (fora de abrigos)?",
    options: [
      "A peça adversária regressa à base (é capturada / comida)",
      "Ambas as peças dividem a casa amigavelmente",
      "O jogo termina imediatamente em empate"
    ],
    correct: 0 // A peça adversária regressa à base
  },
  {
    id: 4,
    text: "Qual é o limite máximo de tempo para jogar em cada turno?",
    options: ["10 segundos por jogada", "30 segundos por jogada", "Sem limite de tempo"],
    correct: 1 // 30 segundos
  }
];

export default function Register() {
  const navigate = useNavigate();
  const { setUser } = useRenewStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Multi-step wizards: 1 = Info, 2 = Avatar, 3 = Rules Quiz
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form State
  const [formData, setFormData] = useState({
    username: '',
    phone: '',
    province: '',
    password: ''
  });

  // Avatar State
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>('pres_lion');
  const [customAvatarBase64, setCustomAvatarBase64] = useState<string | null>(null);

  // Quiz State (stores index of selected option)
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);

  // Handle local custom file upload
  const handleCustomAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 200 * 1024) {
        alert('A imagem é demasiado grande! Por favor escolha uma foto com menos de 200 KB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setCustomAvatarBase64(reader.result as string);
        setSelectedPresetId(null);
      };
      reader.readAsDataURL(file);
    }
  };

  // Step 1 Submission: validation and checking if username is taken
  const handleGoToStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const cleanUsername = formData.username.trim().toLowerCase();
    if (!cleanUsername) {
      setError('Por favor introduza um nome de usuário.');
      setLoading(false);
      return;
    }
    if (cleanUsername.includes(' ') || !/^[a-z0-9_]+$/.test(cleanUsername)) {
      setError('O Nome de Usuário deve ter apenas 1 palavra (sem espaços ou caracteres especiais).');
      setLoading(false);
      return;
    }

    const cleanPhone = formData.phone.trim().replace(/\s+/g, '');
    if (!/^\d{9}$/.test(cleanPhone)) {
      setError('O Número de Telefone deve ter exatamente 9 dígitos (exclusivo de Angola).');
      setLoading(false);
      return;
    }

    if (!formData.province) {
      setError('Por favor selecione a sua província.');
      setLoading(false);
      return;
    }

    if (formData.password.length < 4) {
      setError('A senha deve ter pelo menos 4 caracteres.');
      setLoading(false);
      return;
    }

    try {
      // Check if user already exists
      const userRef = ref(db, `ludo/usuarios/${cleanUsername}`);
      const snapshot = await get(userRef);

      if (snapshot.exists()) {
        setError('Este Nome de Usuário já está registado. Escolha outro.');
        setLoading(false);
        return;
      }

      // Validated! Move to Step 2
      setStep(2);
    } catch (err: any) {
      console.error('Validation error:', err);
      setError('Erro de ligação. Verifique a sua ligação à internet.');
    } finally {
      setLoading(false);
    }
  };

  // Step 3 Quiz Check and final user insertion
  const handleFinalSubmit = async () => {
    setLoading(true);
    setQuizError(null);

    // Validate if all questions answered
    const unanswered = QUIZ_QUESTIONS.filter(q => quizAnswers[q.id] === undefined);
    if (unanswered.length > 0) {
      setQuizError('Por favor responda a todas as 4 questões do quiz antes de avançar.');
      setLoading(false);
      return;
    }

    // Validate if answers are correct
    const incorrectQuestions = QUIZ_QUESTIONS.filter(q => quizAnswers[q.id] !== q.correct);
    if (incorrectQuestions.length > 0) {
      setQuizSubmitted(true);
      setQuizError('Tem respostas incorretas! Por favor reveja as regras básicas e tente novamente.');
      setLoading(false);
      return;
    }

    // All correct! Proceed to create user account
    const cleanUsername = formData.username.trim().toLowerCase();
    const cleanPhone = formData.phone.trim().replace(/\s+/g, '');

    // Formulate final avatar representation
    let finalAvatar = '';
    if (customAvatarBase64) {
      finalAvatar = customAvatarBase64;
    } else if (selectedPresetId) {
      const presetObj = AVATAR_PRESETS.find(p => p.id === selectedPresetId);
      finalAvatar = presetObj ? presetObj.char : '🦁';
    }

    try {
      const userRef = ref(db, `ludo/usuarios/${cleanUsername}`);
      const newUser = {
        id: cleanUsername,
        username: formData.username.trim(),
        phone: `+244${cleanPhone}`,
        province: formData.province,
        password: formData.password,
        avatar: finalAvatar,
        saldoNormal: 10000, // 10k free Kz Grátis
        saldoProfissional: 0, // starts at 0 real AOA Kz
        active: true,
        wins: 0,
        losses: 0,
        totalGames: 0,
        createdAt: new Date().toISOString()
      };

      await set(userRef, newUser);

      // Log activity
      const activityId = `act_${Date.now()}`;
      await set(ref(db, `ludo/usuarios/${cleanUsername}/atividades/${activityId}`), {
        id: activityId,
        type: 'registro',
        description: 'Criou conta com sucesso na Arena LUDO Angola.',
        timestamp: new Date().toISOString()
      });

      // Welcome popup triggers
      localStorage.setItem('ludo_show_welcome', 'true');
      localStorage.setItem('ludo_logged_username', cleanUsername);

      setUser(newUser);
      navigate('/');
    } catch (err) {
      console.error('Final registration error:', err);
      setQuizError('Erro ao guardar a sua conta. Verifique a sua ligação.');
    } finally {
      setLoading(false);
    }
  };

  const getAvatarDisplay = () => {
    if (customAvatarBase64) {
      return (
        <img 
          src={customAvatarBase64} 
          alt="Avatar Personalizado" 
          className="w-20 h-20 rounded-full object-cover border-2 border-primary"
          referrerPolicy="no-referrer"
        />
      );
    }
    const preset = AVATAR_PRESETS.find(p => p.id === selectedPresetId);
    return (
      <span className="text-4xl">{preset ? preset.char : '🦁'}</span>
    );
  };

  return (
    <div className="px-6 pt-8 pb-12 min-h-screen flex flex-col justify-between text-foreground bg-background">
      {/* Dynamic Background spheres */}
      <div className="absolute top-[-5%] right-[-5%] w-[60%] h-[30%] bg-primary/10 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute bottom-[-5%] left-[-5%] w-[60%] h-[30%] bg-secondary/10 rounded-full blur-[80px] pointer-events-none" />

      <div className="relative z-10">
        {/* Universal Header */}
        <header className="flex items-center gap-4 mb-8">
          <button 
            type="button"
            onClick={() => {
              if (step === 3) setStep(2);
              else if (step === 2) setStep(1);
              else navigate('/splash');
            }} 
            className="w-10 h-10 glass rounded-full flex items-center justify-center cursor-pointer"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-black uppercase tracking-widest text-primary">Registo P2P</h1>
            <p className="text-[10px] opacity-90 uppercase font-bold tracking-wider">
              {step === 1 ? 'Etapa 1: Dados Pessoais' : step === 2 ? 'Etapa 2: Foto de Perfil' : 'Etapa 3: Regras Básicas'}
            </p>
          </div>
        </header>

        {/* Dynamic Wizard Steps indicator */}
        <div className="flex justify-between items-center mb-8 gap-2">
          {[1, 2, 3].map((s) => (
            <div 
              key={s} 
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                step === s ? 'bg-primary' : step > s ? 'bg-primary/40' : 'bg-white/10'
              }`} 
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* STEP 1: ACCOUNT INFORMATION */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <form onSubmit={handleGoToStep2} className="space-y-5">
                {/* Username */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black opacity-80 uppercase tracking-widest ml-1">
                    Nome de Usuário (Apenas 1 palavra)
                  </label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 opacity-50 text-primary" size={18} />
                    <input 
                      required
                      type="text" 
                      placeholder="Ex: joao, dany, ludo_pro"
                      className="w-full h-14 glass rounded-2xl pl-12 pr-4 text-sm font-bold outline-none focus:border-primary transition-colors uppercase tracking-wider text-foreground"
                      value={formData.username}
                      onChange={e => setFormData({...formData, username: e.target.value})}
                    />
                  </div>
                </div>

                {/* Phone */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black opacity-80 uppercase tracking-widest ml-1">
                    Número de Telefone (Angola)
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-4 text-sm font-black text-primary">+244</span>
                    <input 
                      required
                      type="tel" 
                      maxLength={9}
                      placeholder="9xxxxxxxx"
                      className="w-full h-14 glass rounded-2xl pl-16 pr-4 text-sm font-bold outline-none focus:border-primary transition-colors text-foreground"
                      value={formData.phone}
                      onChange={e => setFormData({...formData, phone: e.target.value.replace(/\D/g, '')})}
                    />
                  </div>
                  <p className="text-[9px] opacity-80 ml-1 font-semibold">Introduza os 9 dígitos exclusivos de Angola.</p>
                </div>

                {/* Province */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black opacity-80 uppercase tracking-widest ml-1">
                    Província (Angola)
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 opacity-50 text-primary" size={18} />
                    <select 
                      required
                      className="w-full h-14 glass rounded-2xl pl-12 pr-4 text-sm font-bold outline-none focus:border-primary transition-colors appearance-none bg-background text-foreground"
                      value={formData.province}
                      onChange={e => setFormData({...formData, province: e.target.value})}
                    >
                      <option value="" disabled className="text-muted-foreground bg-background">Selecionar Província</option>
                      {PROVINCES.map(p => (
                        <option key={p} value={p} className="bg-background text-foreground font-bold">{p}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black opacity-80 uppercase tracking-widest ml-1">
                    Senha de Acesso
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 opacity-50 text-primary" size={18} />
                    <input 
                      required
                      type="password" 
                      placeholder="••••"
                      className="w-full h-14 glass rounded-2xl pl-12 pr-4 text-sm font-bold outline-none focus:border-primary transition-colors text-foreground"
                      value={formData.password}
                      onChange={e => setFormData({...formData, password: e.target.value})}
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-danger/10 border border-danger/20 p-4 rounded-2xl text-center">
                    <p className="text-[10px] font-black text-danger uppercase tracking-widest">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-16 bg-primary text-background rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <div className="w-6 h-6 border-2 border-background border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      Seguinte (Foto de Perfil)
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          )}

          {/* STEP 2: CHOOSE OPTIONAL AVATAR */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="text-center space-y-2">
                <h2 className="text-md font-black uppercase tracking-widest">Identidade Visual</h2>
                <p className="text-[10px] opacity-85 leading-relaxed font-semibold">
                  Personalize o seu peão de apostas! Escolha um dos nossos avatares exclusivos ou carregue a sua própria foto de perfil.
                </p>
              </div>

              {/* Preview Circle */}
              <div className="flex justify-center my-6">
                <div className="w-24 h-24 bg-primary/10 border-2 border-primary/30 rounded-full flex items-center justify-center shadow-lg relative">
                  {getAvatarDisplay()}
                  <div className="absolute bottom-0 right-0 bg-primary text-background p-1.5 rounded-full shadow border border-background">
                    <Check size={12} strokeWidth={3} />
                  </div>
                </div>
              </div>

              {/* Presets List */}
              <div className="space-y-3">
                <p className="text-[9px] font-black uppercase tracking-widest opacity-80 ml-1">Avatares da Comunidade:</p>
                <div className="grid grid-cols-6 gap-2">
                  {AVATAR_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setSelectedPresetId(preset.id);
                        setCustomAvatarBase64(null);
                      }}
                      className={`h-14 rounded-2xl border flex items-center justify-center text-2xl transition-all active:scale-90 cursor-pointer ${
                        selectedPresetId === preset.id 
                          ? 'bg-primary/20 border-primary shadow-md' 
                          : 'bg-white/5 border-white/10 hover:border-white/20'
                      }`}
                    >
                      {preset.char}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Uploader Divider */}
              <div className="flex items-center gap-3 my-4">
                <div className="h-[1px] bg-white/10 flex-1" />
                <span className="text-[8px] font-black uppercase tracking-widest opacity-70">Ou Carrega uma Foto</span>
                <div className="h-[1px] bg-white/10 flex-1" />
              </div>

              {/* Custom File Upload Button */}
              <div className="relative">
                <input 
                  type="file" 
                  accept="image/*" 
                  id="custom-avatar-file"
                  className="hidden" 
                  onChange={handleCustomAvatarUpload}
                />
                <label 
                  htmlFor="custom-avatar-file"
                  className="w-full h-14 rounded-2xl border border-dashed border-white/25 hover:border-primary/50 flex items-center justify-center gap-2 cursor-pointer text-xs font-black uppercase tracking-widest bg-white/5 text-foreground hover:bg-primary/5 transition-colors"
                >
                  <Camera size={16} className="text-primary animate-bounce" />
                  Carregar Foto do Telemóvel
                </label>
                <p className="text-[8px] text-center opacity-70 mt-1.5 font-bold uppercase">
                  Tamanho máximo recomendado: 200 KB (Opcional)
                </p>
              </div>

              <div className="pt-6 flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  type="button"
                  className="flex-1 h-16 glass rounded-2xl font-black text-sm uppercase tracking-widest text-foreground active:scale-95 transition-all cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  onClick={() => setStep(3)}
                  type="button"
                  className="flex-1 h-16 bg-primary text-background rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-all cursor-pointer"
                >
                  Avançar para o Quiz
                  <ArrowRight size={18} />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: LUDO RULES MINI-QUIZ */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="text-center space-y-2">
                <h2 className="text-md font-black uppercase tracking-widest text-primary flex items-center justify-center gap-2">
                  <HelpCircle size={18} /> Quiz de Regras Básicas
                </h2>
                <p className="text-[10px] opacity-85 leading-relaxed font-semibold">
                  Prove que conhece o regulamento oficial da Arena LUDO Angola para obter o seu certificado de jogador. Responda corretamente às 4 questões:
                </p>
              </div>

              {/* Questions Stack */}
              <div className="space-y-5 max-h-[380px] overflow-y-auto pr-1 scrollbar-hide">
                {QUIZ_QUESTIONS.map((q, qIdx) => {
                  const selectedOpt = quizAnswers[q.id];
                  const isCorrect = selectedOpt === q.correct;
                  const showFeedback = quizSubmitted && selectedOpt !== undefined;

                  return (
                    <div key={q.id} className="p-4 glass rounded-2xl border-adaptive space-y-3">
                      <p className="text-xs font-black uppercase tracking-wider text-secondary flex gap-1.5">
                        <span className="text-primary">Q{qIdx + 1}.</span> {q.text}
                      </p>

                      <div className="space-y-2">
                        {q.options.map((opt, oIdx) => {
                          const isOptSelected = selectedOpt === oIdx;
                          return (
                            <button
                              key={oIdx}
                              type="button"
                              onClick={() => {
                                setQuizAnswers({ ...quizAnswers, [q.id]: oIdx });
                                setQuizError(null);
                              }}
                              className={`w-full p-3.5 rounded-xl border text-left text-[11px] font-bold transition-all flex items-center justify-between cursor-pointer ${
                                isOptSelected 
                                  ? 'bg-secondary/10 border-secondary text-secondary font-black' 
                                  : 'bg-white/5 border-white/5 text-foreground hover:border-white/10'
                              }`}
                            >
                              <span>{opt}</span>
                              <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                isOptSelected ? 'border-secondary bg-secondary' : 'border-white/20'
                              }`}>
                                {isOptSelected && <Check size={10} className="text-background" strokeWidth={4} />}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {showFeedback && (
                        <div className="pt-1">
                          {isCorrect ? (
                            <p className="text-[8px] font-black text-primary uppercase flex items-center gap-1">
                              <CheckCircle size={10} /> Correta!
                            </p>
                          ) : (
                            <p className="text-[8px] font-black text-danger uppercase flex items-center gap-1">
                              ⚠️ Resposta incorreta. Estude as regras e tente novamente.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {quizError && (
                <div className="bg-danger/10 border border-danger/20 p-4 rounded-2xl text-center">
                  <p className="text-[10px] font-black text-danger uppercase tracking-widest">{quizError}</p>
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  type="button"
                  className="flex-1 h-16 glass rounded-2xl font-black text-sm uppercase tracking-widest text-foreground active:scale-95 transition-all cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  onClick={handleFinalSubmit}
                  type="button"
                  disabled={loading}
                  className="flex-1 h-16 bg-primary text-background rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <div className="w-6 h-6 border-2 border-background border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      Criar Conta Real
                      <Check size={18} strokeWidth={3} />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-8 text-center space-y-4 relative z-10">
        <Link to="/splash" className="text-[11px] font-black uppercase text-primary tracking-widest hover:underline">
          Já tenho uma conta? Entrar
        </Link>
        <p className="text-[9px] font-bold opacity-40 uppercase tracking-widest leading-relaxed">
          Ao registar-se na Arena LUDO, aceita cumprir as directrizes de jogo limpo e P2P.
        </p>
      </div>
    </div>
  );
}

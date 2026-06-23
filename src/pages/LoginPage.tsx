import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useStore } from '../store/useStore';
import { cn } from '../lib/utils';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    // Simulate small delay for premium feel
    await new Promise(resolve => setTimeout(resolve, 1000));

    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = password.trim();
    
    // Admin credentials
    const admins: string[] = [];
    const isAdminEmail = admins.includes(cleanUsername);
    
    // Special password for daniel or standard for others
    const isValidAdminPassword = false;

    console.log('Login attempt:', { username: cleanUsername, isAdminEmail, isValidAdminPassword });

    if (isAdminEmail && isValidAdminPassword) {
      setSuccess(true);
      let adminName = 'Administrador Chaide';
      if (cleanUsername === 'daniel') adminName = 'Daniel';
      
      // Delay navigation to show success state
      setTimeout(() => {
        login({ 
          id: cleanUsername === 'daniel' ? '3' : '1', 
          email: cleanUsername.includes('@') ? cleanUsername : `${cleanUsername}@chaideychaide.com`, 
          name: adminName, 
          role: 'admin' 
        });
        navigate('/admin');
      }, 1200);
    } else if (!isAdminEmail && false) {
      // Trying with admin password but wrong email
      setError('Este usuario no tiene permisos de administrador.');
      setIsLoading(false);
    } else if (cleanUsername && cleanPassword) {
      // Normal guest login
      setSuccess(true);
      setTimeout(() => {
        login({ id: '2', email: cleanUsername.includes('@') ? cleanUsername : 'invitado@chaide.com', name: 'Usuario Invitado', role: 'user' });
        navigate('/');
      }, 1200);
    } else {
      setError('Credenciales incorrectas. Verifica tu usuario y contraseña.');
      setIsLoading(false);
    }
  };

  return (
    <main 
      className="min-h-screen w-full relative flex items-center justify-center bg-[#fdfdfc] font-sans selection:bg-black selection:text-white"
      style={{ overflow: 'hidden' }}
    >
      {/* Back Button */}
      <motion.button
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        onClick={() => navigate('/')}
        className="absolute top-10 left-10 flex items-center gap-2 text-black/50 hover:text-black transition-colors font-medium group"
      >
        <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
        Volver
      </motion.button>

      <div className="max-w-6xl w-full px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-center">
        
        {/* Left Side: Welcome Message */}
        <motion.div 
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="text-left"
        >
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-[#111] mb-6" style={{ letterSpacing: '-0.04em', lineHeight: 1.1 }}>
            Acceso privado <br /> 
            <span className="text-[#111]/40">a tus catálogos</span>
          </h1>
          <p className="text-xl md:text-2xl text-[#111]/60 leading-relaxed font-normal max-w-md">
            Explora, descubre y visualiza lo mejor del diseño en un solo lugar.
          </p>
        </motion.div>

        {/* Right Side: Glass Login Panel */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          className="relative group w-full max-w-md mx-auto lg:ml-auto"
        >
          {/* Main Glass Panel (Liquid Glass Effect) */}
          <div 
            className="relative z-10 p-10 md:p-12 rounded-[28px] bg-black/80 backdrop-blur-[32px] saturate-[180%] border border-white/20 shadow-[0_32px_100px_rgba(0,0,0,0.3)]"
          >
            <h2 className="text-3xl font-semibold text-white mb-10 tracking-tight" style={{ letterSpacing: '-0.02em' }}>Iniciar sesión</h2>
            
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.15em] text-white/40 font-bold ml-1">Usuario</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white focus:outline-none focus:border-white/30 transition-all placeholder:text-white/10"
                  placeholder="Tu usuario"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.15em] text-white/40 font-bold ml-1">Contraseña</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white focus:outline-none focus:border-white/30 transition-all placeholder:text-white/10"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-center gap-2 text-red-400 text-sm pt-2"
                >
                  <AlertCircle className="w-4 h-4" />
                  <span>{error}</span>
                </motion.div>
              )}

              <button
                type="submit"
                disabled={isLoading || success}
                className={cn(
                  "w-full font-semibold rounded-xl py-5 mt-4 active:scale-[0.98] transition-all flex items-center justify-center disabled:cursor-not-allowed",
                  success ? "bg-emerald-500 text-white" : "bg-white text-black hover:bg-[#eaeaea]",
                  isLoading && !success ? "opacity-70" : ""
                )}
              >
                {isLoading && !success ? (
                  <div className="w-6 h-6 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                ) : success ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Acceso concedido</span>
                  </div>
                ) : (
                  "Ingresar"
                )}
              </button>
            </form>
          </div>

          {/* Suttle Glow Effect (Behind Panel) */}
          <div className="absolute -inset-2 bg-gradient-to-br from-black/10 via-transparent to-black/10 rounded-[30px] blur-xl opacity-40 group-hover:opacity-60 transition-opacity pointer-events-none" />
        </motion.div>

      </div>
    </main>
  );
}

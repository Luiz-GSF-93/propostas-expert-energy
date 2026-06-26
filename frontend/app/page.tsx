"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function HomePage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setMessage("Entrando...");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(`Erro: ${error.message}`);
      return;
    }

    setMessage("Login realizado com sucesso.");
    window.location.href = "/dashboard";
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white/95 p-8 shadow-xl backdrop-blur">
        <h1 className="mb-2 text-2xl font-bold text-slate-900">
          Propostas Expert Energy
        </h1>

        <p className="mb-6 text-sm text-slate-600">
          Acesse o sistema com seu usuário interno.
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-800">
              E-mail
            </label>
            <input
              type="email"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-500 shadow-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seuemail@empresa.com"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-800">
              Senha
            </label>
            <input
              type="password"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-500 shadow-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite sua senha"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 py-2.5 font-medium text-white transition hover:bg-slate-800"
          >
            Entrar
          </button>
        </form>

        {message && (
          <p className="mt-4 text-sm text-slate-700">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}

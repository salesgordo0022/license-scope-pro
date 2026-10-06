import { autenticar, clientAdmin, ehAdmin, json, respostaPreflight } from "../_shared/auth.ts";

/**
 * Exclui um usuário do sistema a partir do painel de Usuários.
 *
 * Antes a tela apagava só a linha de `usuario_perfil`: a conta continuava no
 * Supabase Auth (a pessoa ainda conseguia entrar, sem perfil) e o email ficava
 * "já cadastrado", impedindo recriar o acesso. Aqui a conta é removida do Auth
 * e o perfil sai junto (FK com ON DELETE CASCADE).
 *
 * Regras: admin/super_admin; não exclui a si mesmo; admin só exclui usuários
 * da própria empresa e nunca um super_admin.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return respostaPreflight(req);

  try {
    const { auth, erro } = await autenticar(req);
    if (erro) return erro;
    if (!ehAdmin(auth)) return json(req, { error: "Sem permissão" }, 403);

    const { perfil_id } = (await req.json().catch(() => ({}))) as { perfil_id?: string };
    if (!perfil_id) return json(req, { error: "Informe o usuário" }, 400);

    const admin = clientAdmin();
    const { data: alvo } = await admin.from("usuario_perfil").select("id, user_id, empresa_id, tipo").eq("id", perfil_id).maybeSingle();
    if (!alvo) return json(req, { error: "Usuário não encontrado" }, 404);
    if (alvo.id === auth.perfilId) return json(req, { error: "Você não pode excluir seu próprio usuário" }, 400);
    if (auth.tipo !== "super_admin") {
      if (alvo.tipo === "super_admin") return json(req, { error: "Apenas super admins podem excluir super admins" }, 403);
      if (!auth.empresaId || alvo.empresa_id !== auth.empresaId) return json(req, { error: "Usuário de outra empresa" }, 403);
    }

    const { error } = await admin.auth.admin.deleteUser(alvo.user_id);
    if (error) {
      console.error("[delete-user] falha:", error);
      return json(req, { error: error.message }, 400);
    }
    // Garantia caso a FK não esteja com CASCADE.
    await admin.from("usuario_perfil").delete().eq("id", alvo.id);
    return json(req, { success: true });
  } catch (error) {
    console.error("[delete-user] erro:", error);
    return json(req, { error: "Erro interno ao excluir usuário" }, 500);
  }
});

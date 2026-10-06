import { autenticar, clientAdmin, ehAdmin, json, respostaPreflight } from "../_shared/auth.ts";

/** Tamanho mínimo de senha aceito na criação de usuário. */
const SENHA_MINIMA = 10;

/** Perfis que um admin pode atribuir ao criar um usuário. */
const TIPOS_VALIDOS = new Set(["admin", "revendedor", "super_admin"]);

/**
 * Cria um usuário do sistema a partir do painel de Usuários.
 *
 * Roda com a service role (`auth.admin.createUser`), então a autorização é toda
 * checada aqui: precisa de JWT válido, de perfil admin/super_admin, e só um
 * super_admin pode criar outro super_admin.
 *
 * O usuário nasce vinculado à MESMA empresa de quem o criou. Antes isso ficava
 * implícito no trigger `handle_new_user`, que cria o perfil com `empresa_id`
 * nulo — o novo usuário ficava "solto", fora de qualquer tenant.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return respostaPreflight(req);

  try {
    // --- Autorização ------------------------------------------------------
    const { auth, erro } = await autenticar(req);
    if (erro) return erro;
    if (!ehAdmin(auth)) {
      return json(req, { error: "Sem permissão" }, 403);
    }

    const corpo = await req.json();
    const email = typeof corpo.email === "string" ? corpo.email.trim().toLowerCase() : corpo.email;
    const nome = typeof corpo.nome === "string" ? corpo.nome.trim() : corpo.nome;
    const { password, tipo } = corpo;

    // --- Validação de entrada --------------------------------------------
    if (!email || !password || !nome) {
      return json(req, { error: "Email, senha e nome são obrigatórios" }, 400);
    }
    if (typeof password !== "string" || password.length < SENHA_MINIMA) {
      return json(req, { error: `A senha precisa ter ao menos ${SENHA_MINIMA} caracteres` }, 400);
    }
    // Mesma regra da tela (src/lib/authPolicy.ts): 3 de 4 tipos de caractere.
    const categorias = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
    if (categorias < 3) {
      return json(req, { error: "A senha precisa misturar ao menos 3 destes: minúscula, maiúscula, número e símbolo" }, 400);
    }
    if (typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json(req, { error: "Email inválido" }, 400);
    }
    const tipoFinal = tipo || "revendedor";
    if (!TIPOS_VALIDOS.has(tipoFinal)) {
      return json(req, { error: "Tipo de usuário inválido" }, 400);
    }
    // Escalada de privilégio: só quem já é super_admin cria outro super_admin.
    if (tipoFinal === "super_admin" && auth.tipo !== "super_admin") {
      return json(req, { error: "Apenas super admins podem criar super admins" }, 403);
    }

    // --- Criação ----------------------------------------------------------
    const adminClient = clientAdmin();

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome },
    });

    if (createError || !newUser?.user) {
      console.error("[create-user] falha ao criar:", createError);
      const msg = createError?.message ?? "";
      if (/already|registered|exists/i.test(msg)) return json(req, { error: "Este email já está cadastrado no sistema" }, 409);
      return json(req, { error: msg || "Não foi possível criar o usuário" }, 400);
    }

    // O trigger `handle_new_user` já criou o perfil como 'revendedor' e sem
    // empresa. Aqui ajustamos o tipo e amarramos o usuário ao tenant de quem
    // o criou — um super_admin pode criar sem empresa (acesso global).
    // upsert: se o trigger não tiver criado o perfil, cria aqui.
    const { data: perfil, error: perfilError } = await adminClient
      .from("usuario_perfil")
      .upsert({ user_id: newUser.user.id, email, tipo: tipoFinal, nome, empresa_id: auth.empresaId }, { onConflict: "user_id" })
      .select("id")
      .maybeSingle();

    if (perfilError || !perfil) {
      // Desfaz: sem perfil configurado a conta ficaria órfã e o email "já cadastrado".
      console.error("[create-user] perfil não configurado, desfazendo:", perfilError);
      await adminClient.auth.admin.deleteUser(newUser.user.id).catch(() => undefined);
      return json(req, { error: `Não foi possível configurar o perfil: ${perfilError?.message ?? "perfil não encontrado"}` }, 500);
    }

    // Devolve só o necessário: o objeto completo do Auth traz metadados
    // internos (provedores, tokens de confirmação) que a tela não usa.
    return json(req, {
      success: true,
      user: { id: newUser.user.id, email: newUser.user.email, nome, tipo: tipoFinal },
    });
  } catch (error) {
    console.error("[create-user] erro:", error);
    return json(req, { error: "Erro interno ao criar usuário" }, 500);
  }
});

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

    const { email, password, nome, tipo } = await req.json();

    // --- Validação de entrada --------------------------------------------
    if (!email || !password || !nome) {
      return json(req, { error: "Email, senha e nome são obrigatórios" }, 400);
    }
    if (typeof password !== "string" || password.length < SENHA_MINIMA) {
      return json(req, { error: `A senha precisa ter ao menos ${SENHA_MINIMA} caracteres` }, 400);
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
      return json(req, { error: createError?.message ?? "Não foi possível criar o usuário" }, 400);
    }

    // O trigger `handle_new_user` já criou o perfil como 'revendedor' e sem
    // empresa. Aqui ajustamos o tipo e amarramos o usuário ao tenant de quem
    // o criou — um super_admin pode criar sem empresa (acesso global).
    const { error: perfilError } = await adminClient
      .from("usuario_perfil")
      .update({ tipo: tipoFinal, nome, empresa_id: auth.empresaId })
      .eq("user_id", newUser.user.id);

    if (perfilError) {
      console.error("[create-user] usuário criado mas perfil não atualizado:", perfilError);
      return json(req, { error: "Usuário criado, mas o perfil não pôde ser configurado" }, 500);
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

import { assertEquals } from "jsr:@std/assert@1";
import { handleApiRequest } from "./api.ts";

Deno.test("API Auth & Sync: suporte multi-dispositivo seguro e proteção de backup", async () => {
  const testEmail = `teste_${Date.now()}@finansys.app`;
  const password = "senhaSegura123";

  // 1. Aparelho 1 (PC) faz login inicial
  const req1 = new Request("http://localhost/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: testEmail,
      password,
      nome: "Usuário Teste",
    }),
  });

  const res1 = await handleApiRequest(req1);
  assertEquals(res1?.status, 200);
  const data1 = await res1?.json();
  assertEquals(data1.ok, true);
  assertEquals(data1.email, testEmail);
  const tokenDevice1 = data1.token;

  // Validação: Aparelho 1 consegue consultar /api/auth/me
  const reqMe1 = new Request("http://localhost/api/auth/me", {
    headers: { Authorization: `Bearer ${tokenDevice1}` },
  });
  const resMe1 = await handleApiRequest(reqMe1);
  assertEquals(resMe1?.status, 200);

  // 2. Aparelho 2 (Celular) loga na mesma conta sem bloqueios
  const req2 = new Request("http://localhost/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: testEmail,
      password,
    }),
  });

  const res2 = await handleApiRequest(req2);
  assertEquals(res2?.status, 200);
  const data2 = await res2?.json();
  assertEquals(data2.ok, true);
  const tokenDevice2 = data2.token;

  // Ambos os aparelhos possuem sessões válidas e ativas
  const reqMe2 = new Request("http://localhost/api/auth/me", {
    headers: { Authorization: `Bearer ${tokenDevice2}` },
  });
  const resMe2 = await handleApiRequest(reqMe2);
  assertEquals(resMe2?.status, 200);

  const resMe1AindaAtivo = await handleApiRequest(
    new Request("http://localhost/api/auth/me", {
      headers: { Authorization: `Bearer ${tokenDevice1}` },
    })
  );
  assertEquals(resMe1AindaAtivo?.status, 200);

  // 3. Aparelho 1 envia backup inicial populado
  const initialPayload = {
    version: 2,
    exportedAt: Date.now(),
    data: {
      empresas: [{ id: "emp_1", nome: "Empresa 1", updatedAt: Date.now() }],
      lancamentos: [{ id: "lanc_1", valorCentavos: 10000, updatedAt: Date.now() }],
      anos: [],
      categorias: [],
      contas: [],
      projecoes: [],
    },
  };

  const reqPush1 = new Request("http://localhost/api/sync/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenDevice1}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payload: initialPayload, clientId: "cli_1" }),
  });
  const resPush1 = await handleApiRequest(reqPush1);
  assertEquals(resPush1?.status, 200);

  // 4. Aparelho 2 puxa da nuvem e recebe exatamente os dados salvos
  const reqPull2 = new Request("http://localhost/api/sync/pull", {
    headers: { Authorization: `Bearer ${tokenDevice2}` },
  });
  const resPull2 = await handleApiRequest(reqPull2);
  assertEquals(resPull2?.status, 200);
  const dataPull2 = await resPull2?.json();
  assertEquals(dataPull2.payload.data.empresas.length, 1);
  assertEquals(dataPull2.payload.data.lancamentos.length, 1);

  // 5. Aparelho tenta enviar backup vazio -> Servidor protege os dados existentes
  const emptyPayload = {
    version: 2,
    exportedAt: Date.now(),
    data: {
      empresas: [],
      lancamentos: [],
      anos: [],
      categorias: [],
      contas: [],
      projecoes: [],
    },
  };
  const reqPushEmpty = new Request("http://localhost/api/sync/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenDevice2}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payload: emptyPayload, clientId: "cli_2" }),
  });
  const resPushEmpty = await handleApiRequest(reqPushEmpty);
  assertEquals(resPushEmpty?.status, 200);
  const dataPushEmpty = await resPushEmpty?.json();
  assertEquals(dataPushEmpty.ignored, true);

  // 6. Confirma que os dados originais permanecem 100% seguros
  const reqPullCheck = new Request("http://localhost/api/sync/pull", {
    headers: { Authorization: `Bearer ${tokenDevice1}` },
  });
  const resPullCheck = await handleApiRequest(reqPullCheck);
  assertEquals(resPullCheck?.status, 200);
  const dataCheck = await resPullCheck?.json();
  assertEquals(dataCheck.payload.data.empresas.length, 1);
  assertEquals(dataCheck.payload.data.lancamentos.length, 1);
});

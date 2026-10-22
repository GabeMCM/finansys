import { assertEquals } from "jsr:@std/assert@1";
import { handleApiRequest } from "./api.ts";

Deno.test("API Auth: sessão única e confirmação de takeover entre múltiplos aparelhos", async () => {
  const testEmail = `teste_${Date.now()}@finansys.app`;
  const password = "senhaSegura123";

  // 1. Aparelho 1 faz login inicial
  const req1 = new Request("http://localhost/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: testEmail,
      password,
      nome: "Usuário Teste",
      deviceId: "device_aparelho_1",
      deviceName: "Chrome no PC Windows",
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

  // 2. Aparelho 2 tenta logar na mesma conta SEM confirmação de takeover
  const req2Tentativa = new Request("http://localhost/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: testEmail,
      password,
      deviceId: "device_aparelho_2",
      deviceName: "Safari no iPhone",
      confirmTakeover: false,
    }),
  });

  const res2Tentativa = await handleApiRequest(req2Tentativa);
  assertEquals(res2Tentativa?.status, 200);
  const data2Tentativa = await res2Tentativa?.json();
  assertEquals(data2Tentativa.ok, false);
  assertEquals(data2Tentativa.requiresTakeoverConfirm, true);
  assertEquals(data2Tentativa.activeDeviceName, "Chrome no PC Windows");

  // 3. Aparelho 2 confirma o takeover (desconectar outro aparelho e entrar aqui)
  const req2Confirm = new Request("http://localhost/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: testEmail,
      password,
      deviceId: "device_aparelho_2",
      deviceName: "Safari no iPhone",
      confirmTakeover: true,
    }),
  });

  const res2Confirm = await handleApiRequest(req2Confirm);
  assertEquals(res2Confirm?.status, 200);
  const data2Confirm = await res2Confirm?.json();
  assertEquals(data2Confirm.ok, true);
  const tokenDevice2 = data2Confirm.token;

  // 4. Aparelho 1 deve ser REJEITADO (sessão revogada)
  const reqMe1Revogado = new Request("http://localhost/api/auth/me", {
    headers: { Authorization: `Bearer ${tokenDevice1}` },
  });
  const resMe1Revogado = await handleApiRequest(reqMe1Revogado);
  assertEquals(resMe1Revogado?.status, 401);
  const dataMe1Revogado = await resMe1Revogado?.json();
  assertEquals(dataMe1Revogado.error, "SESSION_REVOKED");
  assertEquals(dataMe1Revogado.newDevice, "Safari no iPhone");

  // 5. Aparelho 2 é a sessão ativa autorizada
  const reqMe2 = new Request("http://localhost/api/auth/me", {
    headers: { Authorization: `Bearer ${tokenDevice2}` },
  });
  const resMe2 = await handleApiRequest(reqMe2);
  assertEquals(resMe2?.status, 200);
  const dataMe2 = await resMe2?.json();
  assertEquals(dataMe2.email, testEmail);

  // 6. Aparelho 2 envia backup inicial populado
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
      Authorization: `Bearer ${tokenDevice2}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payload: initialPayload, clientId: "cli_1" }),
  });
  const resPush1 = await handleApiRequest(reqPush1);
  assertEquals(resPush1?.status, 200);

  // 7. Confirma que o pull retorna os dados populados
  const reqPull1 = new Request("http://localhost/api/sync/pull", {
    headers: { Authorization: `Bearer ${tokenDevice2}` },
  });
  const resPull1 = await handleApiRequest(reqPull1);
  assertEquals(resPull1?.status, 200);
  const dataPull1 = await resPull1?.json();
  assertEquals(dataPull1.payload.data.empresas.length, 1);
  assertEquals(dataPull1.payload.data.lancamentos.length, 1);

  // 8. Tenta enviar push com payload vazio (0 empresas, 0 lançamentos)
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
    body: JSON.stringify({ payload: emptyPayload, clientId: "cli_1" }),
  });
  const resPushEmpty = await handleApiRequest(reqPushEmpty);
  assertEquals(resPushEmpty?.status, 200);
  const dataPushEmpty = await resPushEmpty?.json();
  assertEquals(dataPushEmpty.ignored, true);

  // 9. Confirma que o servidor preservou os dados intactos
  const reqPull2 = new Request("http://localhost/api/sync/pull", {
    headers: { Authorization: `Bearer ${tokenDevice2}` },
  });
  const resPull2 = await handleApiRequest(reqPull2);
  assertEquals(resPull2?.status, 200);
  const dataPull2 = await resPull2?.json();
  assertEquals(dataPull2.payload.data.empresas.length, 1);
  assertEquals(dataPull2.payload.data.lancamentos.length, 1);
});

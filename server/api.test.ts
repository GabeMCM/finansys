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
});

import { assertEquals } from "jsr:@std/assert@1";
import { formatCpfCnpj, labelCpfCnpj } from "./format.ts";

Deno.test("formatCpfCnpj formata CPF corretamente com digitação de apenas números", () => {
  assertEquals(formatCpfCnpj("123"), "123");
  assertEquals(formatCpfCnpj("1234"), "123.4");
  assertEquals(formatCpfCnpj("123456"), "123.456");
  assertEquals(formatCpfCnpj("1234567"), "123.456.7");
  assertEquals(formatCpfCnpj("123456789"), "123.456.789");
  assertEquals(formatCpfCnpj("1234567890"), "123.456.789-0");
  assertEquals(formatCpfCnpj("12345678901"), "123.456.789-01");
});

Deno.test("formatCpfCnpj formata CNPJ corretamente com digitação de apenas números", () => {
  assertEquals(formatCpfCnpj("123456780001"), "12.345.678/0001");
  assertEquals(formatCpfCnpj("1234567800019"), "12.345.678/0001-9");
  assertEquals(formatCpfCnpj("12345678000195"), "12.345.678/0001-95");
  // Limita a 14 dígitos
  assertEquals(formatCpfCnpj("12345678000195999"), "12.345.678/0001-95");
});

Deno.test("formatCpfCnpj remove pontuações pré-existentes e reformata", () => {
  assertEquals(formatCpfCnpj("123.456.789-01"), "123.456.789-01");
  assertEquals(formatCpfCnpj("12.345.678/0001-95"), "12.345.678/0001-95");
});

Deno.test("labelCpfCnpj adiciona rótulo apropriado para CPF e CNPJ", () => {
  assertEquals(labelCpfCnpj(""), "");
  assertEquals(labelCpfCnpj("12345678901"), "CPF: 123.456.789-01");
  assertEquals(labelCpfCnpj("12345678000195"), "CNPJ: 12.345.678/0001-95");
});

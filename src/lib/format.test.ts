import { assertEquals } from "jsr:@std/assert@1";
import {
  digitsToCentavos,
  formatCentavosBRL,
  formatCentavosValor,
  formatCpfCnpj,
  labelCpfCnpj,
} from "./format.ts";

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

Deno.test("digitsToCentavos converte digitação de máscara em centavos inteiros", () => {
  assertEquals(digitsToCentavos(""), 0);
  assertEquals(digitsToCentavos("0"), 0);
  assertEquals(digitsToCentavos("5"), 5);
  assertEquals(digitsToCentavos("24"), 24);
  assertEquals(digitsToCentavos("2400"), 2400); // R$ 24,00
  assertEquals(digitsToCentavos("240000"), 240000); // R$ 2.400,00
  assertEquals(digitsToCentavos("R$ 2.400,00"), 240000);
});

Deno.test("formatCentavosValor e formatCentavosBRL formatam centavos corretamente", () => {
  assertEquals(formatCentavosValor(0), "0,00");
  assertEquals(formatCentavosValor(5), "0,05");
  assertEquals(formatCentavosValor(50), "0,50");
  assertEquals(formatCentavosValor(2400), "24,00");
  assertEquals(formatCentavosValor(240000), "2.400,00");
  assertEquals(formatCentavosBRL(240000), "R$ 2.400,00");
});


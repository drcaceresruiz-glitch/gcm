import { describe, it, expect } from "vitest";
import {
  claveDeMigracion,
  firmarMigracion,
  migracionValida,
  nuevaSal,
  validarFrase,
  MINIMO_FRASE,
} from "./respaldo-migracion";
import { firmar, claveDeRespaldo } from "./respaldo-manifiesto";

/**
 * La firma del respaldo que SI cruza de una instalacion a otra.
 *
 * Lo que se vigila: que sin la frase exacta no valide, que dos exportaciones
 * no compartan clave, y —lo mas importante— que un archivo de migracion no
 * pueda hacerse pasar por un respaldo de obra, que es el que si da procedencia.
 */

const FRASE = "mudanza de la constructora 2026";
const MANIFIESTO = '{"empresa":{"id":"c1"},"tablas":[]}';

describe("la firma de una migracion entre instalaciones", () => {
  it("valida con la misma frase y la misma sal", () => {
    const sal = nuevaSal();
    const firma = firmarMigracion(MANIFIESTO, FRASE, sal);
    expect(migracionValida(MANIFIESTO, firma, FRASE, sal)).toBe(true);
  });

  it("no valida con otra frase", () => {
    const sal = nuevaSal();
    const firma = firmarMigracion(MANIFIESTO, FRASE, sal);
    expect(migracionValida(MANIFIESTO, firma, "otra frase distinta", sal)).toBe(
      false,
    );
  });

  it("no valida si el manifiesto cambio", () => {
    const sal = nuevaSal();
    const firma = firmarMigracion(MANIFIESTO, FRASE, sal);
    const tocado = MANIFIESTO.replace('"c1"', '"c2"');
    expect(migracionValida(tocado, firma, FRASE, sal)).toBe(false);
  });

  /**
   * La sal viaja en claro; su trabajo no es ser secreta sino que dos archivos
   * con la MISMA frase no compartan clave. Sin ella, una tabla precalculada
   * valdria para todos los clientes a la vez.
   */
  it("la misma frase con distinta sal da distinta clave", () => {
    const a = claveDeMigracion(FRASE, nuevaSal());
    const b = claveDeMigracion(FRASE, nuevaSal());
    expect(a.equals(b)).toBe(false);
  });

  it("cada exportacion recibe una sal distinta", () => {
    expect(nuevaSal()).not.toBe(nuevaSal());
  });

  /**
   * EL CONTROL QUE MAS IMPORTA. El respaldo de obra da PROCEDENCIA —lo firma
   * un secreto del servidor—; la migracion solo da integridad y acuerdo entre
   * dos partes. Si un archivo de migracion pudiera presentarse como respaldo
   * de obra, cualquiera con una frase fabricaria uno «de la casa».
   *
   * Lo impide que el tipo entre DENTRO de lo firmado, no solo en el JSON.
   */
  it("una migracion NO puede hacerse pasar por un respaldo de obra", () => {
    const sal = nuevaSal();
    const firmaMigracion = firmarMigracion(MANIFIESTO, FRASE, sal);

    // Un respaldo de obra se valida contra la clave del servidor. La firma de
    // migracion no puede coincidir con ella ni por casualidad.
    const claveObra = claveDeRespaldo("un-secreto-de-servidor-de-32-caracteres", "c1");
    expect(firmaMigracion).not.toBe(firmar(MANIFIESTO, claveObra));
  });

  /** Y al reves: la firma de obra tampoco cuela como migracion. */
  it("un respaldo de obra NO valida como migracion", () => {
    const sal = nuevaSal();
    const claveObra = claveDeRespaldo("un-secreto-de-servidor-de-32-caracteres", "c1");
    const firmaObra = firmar(MANIFIESTO, claveObra);

    expect(migracionValida(MANIFIESTO, firmaObra, FRASE, sal)).toBe(false);
  });

  it("una firma que no es hexadecimal no lanza, devuelve falso", () => {
    const sal = nuevaSal();
    expect(migracionValida(MANIFIESTO, "no-soy-una-firma", FRASE, sal)).toBe(false);
    expect(migracionValida(MANIFIESTO, "", FRASE, sal)).toBe(false);
  });
});

describe("la frase que protege el archivo", () => {
  it("exige una longitud minima", () => {
    expect(validarFrase("corta").ok).toBe(false);
    expect(validarFrase("x".repeat(MINIMO_FRASE)).ok).toBe(true);
  });

  it("no cuenta los espacios de los extremos como longitud", () => {
    expect(validarFrase(`   ${"x".repeat(MINIMO_FRASE - 1)}   `).ok).toBe(false);
  });

  /**
   * Se normaliza a NFKC antes de derivar: una frase con tildes tecleada en
   * otro teclado puede llegar descompuesta y daria otra clave, con el archivo
   * intacto y la frase «correcta».
   */
  it("una frase acentuada vale igual escrita descompuesta", () => {
    const sal = nuevaSal();
    const compuesta = "migración de la obra";
    const descompuesta = compuesta.normalize("NFD");

    expect(compuesta).not.toBe(descompuesta);
    const firma = firmarMigracion(MANIFIESTO, compuesta, sal);
    expect(migracionValida(MANIFIESTO, firma, descompuesta, sal)).toBe(true);
  });
});

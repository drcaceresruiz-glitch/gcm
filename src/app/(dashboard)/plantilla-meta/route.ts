import { obtenerSesion } from "@/services/sesion.service";
import { puede } from "@/lib/rbac";
import { generarPlantillaMeta } from "@/lib/plantilla-meta";
import { nombreDeArchivo } from "@/lib/nombre-archivo";
import { obtenerObra } from "@/services/obras.service";
import { obtenerEmpresa } from "@/services/empresa.service";

/**
 * Descarga de la plantilla del presupuesto meta.
 *
 * Se genera al vuelo, como la del presupuesto: asi sale SIEMPRE del mismo
 * codigo que el test de ida y vuelta valida contra los dos importadores, y no
 * hay una copia estatica en `public/` que pueda quedarse vieja.
 *
 * Pide `meta:leer` y no solo sesion, al contrario que la del presupuesto. El
 * archivo no lleva ni un dato de la empresa —son ejemplos inventados— pero su
 * hoja de instrucciones explica como se calcula la bolsa y que la utilidad se
 * deja fuera. A quien no puede ver el margen no se le entrega el manual de
 * como se construye.
 */
export async function GET(peticion: Request) {
  const sesion = await obtenerSesion();
  if (!sesion) return new Response("No autorizado", { status: 401 });
  if (!puede(sesion, "meta:leer")) {
    return new Response("No autorizado", { status: 403 });
  }

  /**
   * El plazo de la obra viaja por la URL. La ruta es generica —no cuelga de
   * una obra— porque la plantilla no lleva ni un dato de la empresa; lo unico
   * que necesita es cuantos meses dura, para que los ejemplos no propongan
   * ocho meses en una obra de trece dias.
   */
  const parametros = new URL(peticion.url).searchParams;

  const pedido = parametros.get("meses");
  const meses = pedido === null ? null : Number(pedido);
  const buffer = await generarPlantillaMeta(
    meses !== null && Number.isFinite(meses) && meses > 0 ? meses : null,
  );

  /**
   * EL NOMBRE DEL ARCHIVO LLEVA LA OBRA, y por eso viaja su id.
   *
   * Hasta el 23 de agosto de 2026 esta descarga salia siempre como
   * «plantilla-presupuesto-meta-gcm.xlsx». Quien preparaba tres obras se
   * llevaba «(1)», «(2)» y «(3)» a la carpeta de Descargas: tres archivos
   * indistinguibles que hay que abrir para saber cual es cual. De ahi salio
   * la peticion de poder crear carpetas por obra, cuando lo que faltaba era
   * que el nombre distinguiera.
   *
   * El nombre NO viene en la URL: viene el ID, y el nombre se busca con la
   * sesion. Es la regla de la casa -nada que el cliente pueda escribir- y
   * aqui pesa el doble, porque este texto acaba en una cabecera HTTP.
   */
  const obraId = parametros.get("obra");
  const obra = obraId ? await obtenerObra(sesion, obraId) : null;
  const empresa = obra ? null : await obtenerEmpresa(sesion);

  const nombre = nombreDeArchivo({
    ambito: obra?.nombreObra ?? empresa?.razonSocial ?? "plantilla",
    documento: "presupuesto-meta",
    // Sin fecha: es una plantilla en blanco, no un documento de un dia. Una
    // fecha aqui haria creer que caduca.
    extension: "xlsx",
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}

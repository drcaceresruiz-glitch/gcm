/**
 * De quien es GCM: la empresa titular y quienes lo hacen.
 *
 * POR QUE EXISTE ESTE ARCHIVO. Hasta el 19/08/2026 el pie decia «GCM © 2026»
 * y dos nombres de persona. «GCM» es el nombre del producto, no una persona
 * juridica: un aviso de derechos a nombre de un producto no atribuye nada a
 * nadie. La empresa que lo crea y lo explota no aparecia en ningun sitio de
 * la aplicacion.
 *
 * VIVE EN UN SOLO SITIO a proposito, como la version. Un dato de este tipo
 * copiado en el pie, en el manual y en un aviso legal es un dato que algun
 * dia dira tres cosas distintas — y de los tres, dos seran falsas.
 *
 * NO CAMBIA EN LA VERSION INSTALABLE. Quien vende el software sigue siendo el
 * mismo se ejecute donde se ejecute, asi que esto no cae bajo la regla de «no
 * dar por hecho que hay alguien operando detras»: aquella habla del SERVICIO
 * —buzones, colas, servidores— y esto habla de la AUTORIA.
 *
 * El RUC no se pone aqui ni en el pie: identifica a la empresa ante SUNAT y
 * su sitio son los documentos que salen a terceros, no el pie de cada
 * pantalla.
 */

export const AUTORIA = {
  /// La titular del software, tal como se lee en un aviso de derechos.
  empresa: "Constructora Origen 1111 E.I.R.L.",

  /**
   * Quienes lo hacen. El orden NO es alfabetico ni jerarquico: primero quien
   * lo disena y programa, despues quien lo dirige, que es como se leen los
   * creditos de cualquier obra.
   */
  personas: [
    { nombre: "Dr. Cáceres Ruiz", papel: "Diseño y desarrollo" },
    { nombre: "Arq. Eduardo Antonio Pérez Moreno", papel: "Dirección" },
  ],
} as const;

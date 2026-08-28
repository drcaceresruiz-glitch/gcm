import { Bloque, Col, Tabla } from "@/components/investigacion/piezas";

/**
 * Lo que hay que decidir ANTES de tener obra.
 *
 * Va en la pantalla de entrada y no dentro de una obra porque todo lo que
 * cuenta se decide cuando todavia no hay ninguna: como se consigue el periodo
 * previo, que se anota desde la primera semana y que no se puede cambiar a
 * mitad. Explicarlo dentro de la obra seria explicarlo tarde.
 *
 * Repite a proposito unas pocas cosas que tambien estan en `docs/tesis/`: el
 * documento lo lee quien escribe la tesis, y esto lo lee quien va a pulsar los
 * botones, que a veces es la misma persona con seis meses de diferencia.
 */

export function GuiaDelEstudio() {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Cómo se monta el estudio</h2>
        <p className="mt-1 max-w-3xl text-sm text-pretty opacity-70">
          Lo que hay que decidir antes de empezar a medir. Casi todo lo de aquí
          no se puede arreglar después.
        </p>
      </div>

      <div className="space-y-2">
        <Bloque
          titulo="1. El diseño, en una pantalla"
          resumen="Series cronológicas interrumpidas: la misma obra medida antes y después, semana a semana."
        >
          <p>
            Se mide <strong>una sola obra</strong> a lo largo del tiempo: diez o
            doce semanas antes de implantar el sistema, y otras tantas después.
            La <strong>semana</strong> es la unidad de análisis, porque es el
            ciclo del Last Planner.
          </p>
          <p className="font-mono text-xs opacity-80">
            O₁ O₂ O₃ … O₁₀ &nbsp; X &nbsp; O₁₁ O₁₂ … O₂₀
          </p>
          <p>
            No hay grupo de control ni asignación al azar, y no es un descuido:
            una obra es única e irrepetible, y no existe otra idéntica que pueda
            correr en paralelo. Lo que sustituye al grupo de control es{" "}
            <strong>la propia obra antes de la intervención</strong>, medida
            muchas veces.
          </p>
          <p className="opacity-70">
            Por eso no vale medir una sola vez antes y otra después: una obra
            atraviesa fases distintas —tierras, estructuras, acabados— y dos
            promedios sueltos confundirían el efecto del sistema con el cambio
            de fase. La medición repetida es lo que permite separarlos.
          </p>
        </Bloque>

        <Bloque
          titulo="2. De dónde salen los datos de antes"
          resumen="Del Last Planner en papel. El método es el mismo en ambas fases; lo que cambia es el soporte."
        >
          <p>
            Es la pregunta difícil: si el sistema todavía no está instalado, ¿de
            dónde sale el periodo previo?
          </p>
          <p>
            <strong>De gestionar esas semanas con Last Planner en papel.</strong>{" "}
            Mismas reuniones, mismos compromisos, misma medición del PPC, mismas
            causas de no cumplimiento — con formatos impresos.
          </p>
          <p>
            La razón es de fondo. Si en la fase previa no hubiera planificación
            semanal, no habría compromisos que medir y{" "}
            <strong>el PPC no sería cero: sería inexistente</strong>. Y si el
            método se implantara a la vez que el sistema, la mejora no podría
            atribuirse a ninguno de los dos por separado.
          </p>
          <p className="opacity-70">
            No es tiempo perdido para la obra: el equipo tiene que aprender el
            ritual semanal de todas formas. Hacerlo primero en papel{" "}
            <em>es</em> la capacitación, y de paso genera el periodo de
            comparación. Al terminar, esas semanas se cargan aquí y se marcan
            como <strong>reconstruidas</strong>, de modo que ambas fases salen
            de la misma exportación y del mismo cálculo.
          </p>
        </Bloque>

        <Bloque
          titulo="3. Lo que se anota desde la primera semana"
          resumen="Tres datos que no se reconstruyen de memoria seis meses después."
        >
          <Tabla
            cabecera={["Qué", "Dónde vive", "Por qué desde el primer día"]}
            filas={[
              [
                "La causa de cada incumplimiento",
                "Plan semanal",
                "Se elige una sola por incumplimiento: la que lo originó, no la última de la cadena. Si el material no llegó porque no se pidió a tiempo, la causa es prerrequisito, no materiales.",
              ],
              [
                "Las dos fechas de cada restricción",
                "Lookahead",
                "La comprometida y la real. Sin la comprometida no hay nada que juzgar; sin la de resolución, el ciclo no ha terminado. De ellas salen la liberación oportuna y toda la variabilidad.",
              ],
              [
                "La fase constructiva de la semana",
                "Campo «fase» del Lookahead",
                "Si las semanas previas caen en estructuras y las posteriores en acabados, alguien objetará que la mejora es del tipo de trabajo. Con la fase anotada se contesta enseñando la composición; sin ella, no se contesta.",
              ],
            ]}
          />
        </Bloque>

        <Bloque
          titulo="4. Lo que NO se puede cambiar a mitad"
          resumen="Un solo cambio de criterio a media serie y las dos fases dejan de ser comparables."
        >
          <ul className="ml-4 list-disc space-y-2">
            <li>
              <strong>Las definiciones de las nueve causas.</strong> Es lo más
              delicado de todo el estudio. Esa tabla es a la vez el eje de la
              comparación entre fases y el instrumento del índice Kappa; si a
              mitad alguien empieza a clasificar distinto, las series dejan de
              ser comparables y{" "}
              <strong>no hay forma de arreglarlo después</strong>. Conviene
              tenerla impresa en la reunión.
            </li>
            <li>
              <strong>Quién clasifica.</strong> Si la persona que decide la
              causa cambia a mitad del estudio, la comparación se contamina. Es
              justo lo que mide el Kappa de Cohen, y conviene aplicarlo con
              incumplimientos de <em>ambas</em> fases.
            </li>
            <li>
              <strong>El día de la reunión.</strong> La semana del Last Planner
              es de siete días; moverla parte las series.
            </li>
            <li>
              <strong>Los códigos de causa del 1 al 9.</strong> No se tocan una
              vez publicados: un estudio que cite «causa 3» tiene que seguir
              apuntando a lo mismo dentro de dos años. El sistema los emite
              siempre con su etiqueta al lado.
            </li>
          </ul>
        </Bloque>

        <Bloque
          titulo="5. Cuántos datos hacen falta"
          resumen="Ocho semanas por fase es el mínimo; el análisis de capacidad pide bastante más."
        >
          <Tabla
            cabecera={["Para qué", "Cuánto hace falta", "Si no llega"]}
            filas={[
              [
                "Comparar las series (PPC, liberación)",
                "Ocho semanas por fase como mínimo; diez o doce es lo razonable",
                "Por debajo de ocho no se puede separar el cambio del ruido.",
              ],
              [
                "Regresión segmentada",
                "Las mismas semanas, sin huecos",
                "Una semana sin datos se registra como tal y se declara. No se rellena a ojo.",
              ],
              [
                "Capacidad del proceso (Cpk)",
                "De 25 a 30 restricciones con las dos fechas, por fase",
                "Se declara como análisis exploratorio en lugar de como resultado. Conviene contarlas al terminar la fase previa, cuando todavía se está a tiempo.",
              ],
              [
                "Cuestionario de percepción",
                "Todo el equipo que haya usado el sistema",
                "Se reporta el tamaño alcanzado y se declara como limitación. No se extraen conclusiones inferenciales.",
              ],
            ]}
          />
        </Bloque>

        <Bloque
          titulo="6. La obra de ensayo, y qué se puede decir de ella"
          resumen="Sirve para verificar el instrumento, no para producir resultados."
        >
          <p>
            La obra de ensayo trae veinte semanas <strong>simuladas</strong>, con
            defectos deliberados: semanas sin observaciones, muestras
            insuficientes para calcular dispersión, registros incompletos y
            distribuciones asimétricas. Un piloto limpio no verifica nada; lo
            que hay que ver antes de la obra real es cómo queda el archivo
            cuando <em>falta</em> algo.
          </p>
          <p>
            Sirve para <strong>comprobar que la exportación entra en JASP</strong>,
            que los estadísticos coinciden y que los valores ausentes se
            conservan como perdidos y no como ceros. También para ensayar el
            análisis completo y dejarlo fijado <em>antes</em> de recolectar, que
            es lo que impide elegir la prueba que más conviene al ver los
            resultados.
          </p>
          <p className="opacity-70">
            <strong>Se declara en la tesis como verificación funcional del
            instrumento</strong>, diciendo expresamente que los datos son
            simulados y que no constituyen resultados del estudio. Presentarla
            de otro modo sería inventar hallazgos.
          </p>
          <p className="opacity-70">
            Borrarla y volver a crearla da exactamente los mismos números: se
            genera de forma determinista, sin azar, para que dos personas puedan
            reproducir la misma verificación.
          </p>
        </Bloque>

        <Bloque
          titulo="7. Lo que este sistema no hace, y es a propósito"
          resumen="Aquí no se calcula ningún contraste ni sale ningún valor p."
        >
          <p>
            La exportación entrega <strong>la observación individual sin
            tocar</strong> —una fila por compromiso, por restricción, por
            tarea— y los agregados por semana. Ni un contraste, ni un valor p,
            ni una conclusión.
          </p>
          <p>
            No es una carencia. El investigador es el mismo que desarrolló el
            sistema, y{" "}
            <strong>un resultado que sale de la misma aplicación que generó los
            datos no lo puede verificar nadie</strong>. Calculándolo fuera, con
            los datos crudos anexados a la tesis, cualquiera puede repetir el
            análisis y llegar a los mismos números — o a otros, y decirlo.
          </p>
          <p className="opacity-70">
            Por la misma razón los archivos no llevan nombres de personas: la
            identidad de quien reportó no hace falta para el análisis, y su
            salida en un archivo que va a circular sí tiene consecuencias. Los
            proveedores viajan con un código anónimo estable{" "}
            <Col>P001</Col>, <Col>P002</Col>…, que permite comparar sin nombrar.
          </p>
        </Bloque>
      </div>
    </section>
  );
}

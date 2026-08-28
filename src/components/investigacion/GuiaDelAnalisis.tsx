import { Bloque, Col, Tabla } from "@/components/investigacion/piezas";

/**
 * Que hacer con los archivos una vez descargados.
 *
 * ESTA AQUI Y NO EN EL MANUAL a proposito. El manual lo lee toda la
 * constructora y esta pantalla la ve una sola persona; ademas, quien descarga
 * estos archivos va a tener que defender delante de un jurado que prueba
 * aplico a que hipotesis y por que. Esa explicacion tiene que estar donde se
 * descarga: separarla del boton es como se acaba corriendo la prueba
 * equivocada seis meses despues, cuando ya nadie se acuerda del criterio.
 *
 * Va plegada en `<details>` porque no se lee todos los dias: se lee la primera
 * vez y el dia del analisis. Abierta a la fuerza, empujaria los botones fuera
 * de la pantalla justo para quien ya sabe lo que hace.
 */

export function GuiaDelAnalisis() {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Qué hacer con estos archivos</h3>
        <p className="mt-1 max-w-3xl text-sm text-pretty opacity-70">
          El orden de trabajo, qué prueba corresponde a cada hipótesis y cómo se
          corre. Despliega lo que necesites.
        </p>
      </div>

      <div className="space-y-2">
        <Bloque
          titulo="1. El orden de trabajo"
          resumen="Cuatro pasos, y los tres primeros están en esta misma pantalla."
        >
          <ol className="ml-4 list-decimal space-y-2">
            <li>
              <strong>Fija el punto de interrupción</strong>: la fecha de la
              primera semana gestionada con el sistema. Sin ella, todas las
              semanas salen <Col>SIN_CLASIFICAR</Col> y no hay dos fases que
              comparar.
            </li>
            <li>
              <strong>Marca el origen de cada semana</strong>: gestionada con la
              herramienta, o reconstruida a partir de registros en papel. Es lo
              que permite demostrar qué semanas se vivieron con el sistema.
            </li>
            <li>
              <strong>Declara la apertura de cada análisis de causa raíz</strong>{" "}
              si la fecha real difiere de cuando se registró en el sistema. De
              ahí sale la latencia de reacción.
            </li>
            <li>
              <strong>Descarga y analiza fuera.</strong> Aquí no se calcula
              ningún contraste a propósito: un resultado que sale de la misma
              aplicación que generó los datos no lo puede verificar nadie.
            </li>
          </ol>
        </Bloque>

        <Bloque
          titulo="2. Qué prueba corresponde a cada hipótesis"
          resumen="PPC y liberación, variabilidad, causas y percepción."
        >
          <Tabla
            cabecera={["Qué se contrasta", "Prueba", "Por qué esa"]}
            filas={[
              [
                <>
                  <strong>H1</strong> — el PPC y la liberación oportuna suben
                </>,
                "t de Welch, o U de Mann-Whitney si no hay normalidad",
                "Compara el promedio de las semanas previas con el de las posteriores. Welch no exige que ambos grupos tengan la misma dispersión, y aquí no la tienen.",
              ],
              [
                <>
                  <strong>H2</strong> — la variabilidad baja
                </>,
                "Brown-Forsythe",
                "Las otras comparan promedios; esta compara dispersiones, que es justo lo que afirma H2. Y aguanta bien que los datos no sean normales.",
              ],
              [
                <>
                  <strong>H3</strong> — cambian las causas
                </>,
                "Chi-cuadrado de homogeneidad",
                "Las causas son categorías, no números. Se usan agrupadas en evitables y externas: con las nueve sueltas quedan celdas con frecuencia esperada menor que cinco y la prueba deja de ser válida.",
              ],
              [
                "Cuánto mejoró, no solo si mejoró",
                "d de Cohen, o correlación biserial de rangos",
                "El valor p dice si el cambio es real; el tamaño del efecto dice si es grande. Se preguntan las dos cosas.",
              ],
              [
                "La percepción del equipo",
                "Descriptivo y alfa de Cronbach",
                "Es un objetivo descriptivo, sin hipótesis: con un equipo de cinco a quince personas no procede la inferencia.",
              ],
            ]}
          />
          <p className="opacity-70">
            Antes de todas ellas van las pruebas de normalidad —Shapiro-Wilk—,
            que son las que deciden si se usa Welch o Mann-Whitney.
          </p>
        </Bloque>

        <Bloque
          titulo="3. La regresión segmentada, y por qué hace falta"
          resumen="Contesta «¿ya venía subiendo?», que la comparación de promedios no puede contestar."
        >
          <p>
            Comparar el promedio de antes con el de después responde{" "}
            <em>«el promedio subió»</em>. No responde{" "}
            <strong>«ya venía subiendo»</strong> — y suele venir subiendo: si la
            fase previa se gestionó con Last Planner en papel, el equipo ya
            practicaba el ritual semanal y mejoraba por practicar.
          </p>
          <p>
            Sin separar esas dos cosas, la comparación de medias le atribuye a la
            herramienta una pendiente que ya existía. Es la objeción de{" "}
            <strong>maduración</strong>, y es la que hunde este tipo de estudios.
          </p>

          <p className="pt-1 font-medium">Las tres columnas ya salen calculadas</p>
          <Tabla
            cabecera={["Columna", "Qué vale", "Qué mide"]}
            filas={[
              [<Col key="a">semana_indice</Col>, "1, 2, 3 … en orden cronológico", "La tendencia que la obra ya traía"],
              [<Col key="b">intervencion</Col>, "0 antes, 1 desde la implantación", "El salto al implantar el sistema"],
              [<Col key="c">tiempo_post</Col>, "0 antes; 1, 2, 3 … desde la primera semana con sistema", "El cambio de pendiente posterior"],
            ]}
          />
          <p className="opacity-70">
            Salen calculadas porque <Col>tiempo_post</Col> cuenta desde la
            primera semana <em>posterior</em>, no desde el principio de la serie:
            desplazarla una posición cambia el resultado sin que nada avise, y es
            el error más común al construirla a mano.
          </p>

          <p className="pt-1 font-medium">Cómo se corre en JASP</p>
          <p>
            Abre <Col>dataset_consolidado.csv</Col> y ve a{" "}
            <strong>Regression → Linear Regression</strong>. En{" "}
            <em>Dependent Variable</em> pon <Col>ppc_pct</Col>; en{" "}
            <em>Covariates</em>, las tres columnas de arriba. En{" "}
            <em>Statistics</em> marca <strong>Durbin-Watson</strong>. Es la
            regresión lineal de siempre: lo que la convierte en un análisis de
            series interrumpidas son las tres columnas, no una opción escondida.
          </p>
          <p>
            Para las demás variables se repite cambiando solo la dependiente:{" "}
            <Col>tasa_liberacion_oportuna_pct</Col>,{" "}
            <Col>retraso_media_dias</Col>, <Col>retraso_desv_dias</Col>,{" "}
            <Col>hhi_causas</Col>.
          </p>

          <p className="pt-1 font-medium">Cómo se lee</p>
          <p>
            El coeficiente de <Col>semana_indice</Col> es la tendencia previa: si
            sale <strong>no significativo</strong>, queda demostrado que el
            indicador no venía subiendo, y esa es la línea que cierra la
            objeción. El de <Col>intervencion</Col> es el salto inmediato, y el
            de <Col>tiempo_post</Col> dice si además se aceleró la mejora.
          </p>
          <p className="opacity-70">
            Si la tendencia previa <em>sí</em> sale significativa no se invalida
            nada: significa que la obra ya mejoraba, y entonces el efecto del
            sistema es el salto y el cambio de pendiente, no la diferencia bruta
            de promedios. La regresión ya lo separó.
          </p>

          <p className="pt-1 font-medium">El Durbin-Watson</p>
          <p>
            Comprueba si cada semana se parece demasiado a su vecina. Cuando eso
            ocurre, el valor p sale más pequeño de lo que corresponde y las cosas
            parecen más significativas de lo que son. Entre <strong>1,5 y
            2,5</strong> no hay problema; fuera de ese rango se declara como
            limitación. Una limitación declarada resta mucho menos que una que
            descubre el jurado.
          </p>
        </Bloque>

        <Bloque
          titulo="4. La fase constructiva, y por qué no se puede añadir después"
          resumen="Sale del campo «fase» del Lookahead. Si nadie lo rellena, la columna sale vacía."
        >
          <p>
            Una obra no es igual a lo largo del tiempo. Si las semanas previas
            caen en <strong>estructuras</strong> —vaciados, encofrados, trabajo
            repetitivo— y las posteriores en <strong>acabados</strong> —más
            fáciles de programar—, el indicador sube, y alguien puede objetar que
            la mejora es del tipo de trabajo y no del sistema.
          </p>
          <p>
            Con la fase anotada, eso se contesta enseñando la composición de cada
            fase del estudio. <strong>Sin ella no se puede contestar</strong>, y
            no se reconstruye de memoria seis meses después.
          </p>
          <p className="font-medium">De dónde sale</p>
          <p>
            Del campo <strong>fase</strong> de las tareas del{" "}
            <strong>Lookahead</strong> —el mismo que agrupa la matriz, con
            valores del estilo <em>«FASE 2: ESTRUCTURAS»</em>—. No hay un campo
            aparte para el estudio a propósito: si la fase de una tarea viviera
            en dos sitios, algún día dirían cosas distintas.
          </p>
          <p>
            La exportación la resume por semana en tres columnas: la fase{" "}
            <strong>dominante</strong> entre los compromisos de esa semana, el{" "}
            <strong>porcentaje</strong> que representa —un valor bajo avisa de
            que la semana estuvo repartida entre frentes— y{" "}
            <Col>fase_constructiva_n</Col>, sobre cuántos compromisos se calculó.
          </p>
          <p className="opacity-70">
            Ese último número es el aviso importante: los compromisos que no
            apuntan a una tarea del cronograma no tienen fase y no cuentan. Si
            sale muy por debajo de <Col>compromisos_evaluados</Col>, la fase de
            esa semana no es de fiar, y conviene rellenar el campo en el
            Lookahead antes de seguir.
          </p>
        </Bloque>

        <Bloque
          titulo="5. Cómo leer los archivos sin equivocarse"
          resumen="Celda vacía, desviación ausente, y por qué la semana se numera por fecha."
        >
          <ul className="ml-4 list-disc space-y-2">
            <li>
              <strong>Una celda vacía no es un cero.</strong> Significa que no
              hubo dato: una semana sin restricciones no tiene media de retraso.
              En JASP y SPSS entra como valor perdido, que es lo correcto.
              Rellenarla con cero mete una semana perfecta que nunca existió.
            </li>
            <li>
              <strong>La desviación estándar necesita dos observaciones.</strong>{" "}
              Con una sola sale vacía, no cero. Es muestral —divide entre n−1—,
              igual que la calculan JASP y SPSS.
            </li>
            <li>
              <strong>Las semanas se numeran por fecha de corte</strong>, no por
              el número del plan. Las semanas reconstruidas se cargan después y
              recibirían números altos con fechas antiguas: ordenando por fecha,
              el índice 1…N es el eje temporal de verdad.
            </li>
            <li>
              <strong>Las causas viajan con código y con etiqueta.</strong> El
              código del 1 al 9 no se cambia nunca una vez publicado: un estudio
              que cite «causa 3» tiene que seguir apuntando a lo mismo dentro de
              dos años.
            </li>
            <li>
              <strong>Los proveedores van anonimizados</strong> con un código
              estable, el mismo en todos los archivos y en todas las descargas.
              Se puede comparar su comportamiento sin publicar quién es cada uno
              en un anexo.
            </li>
            <li>
              <strong>El diccionario de variables se genera con los datos</strong>,
              así que no puede quedarse desfasado. Va como anexo de la tesis.
            </li>
          </ul>
        </Bloque>
      </div>
    </section>
  );
}

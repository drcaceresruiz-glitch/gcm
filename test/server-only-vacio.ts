/**
 * `server-only` fuera de Next.
 *
 * El paquete real lanza un error si se importa sin la condicion
 * `react-server`, que es justo lo que protege: que un servicio acabe en el
 * navegador. En las pruebas no hay navegador ni bundler, y esa proteccion no
 * aplica —pero sin este alias ningun servicio se puede importar y la capa
 * entera queda sin poder probarse, que es peor—.
 */
export {};

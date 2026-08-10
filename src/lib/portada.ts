/**
 * Las diapositivas de la portada: una frase de la filosofia de la casa sobre
 * una foto de obra.
 *
 * LAS FOTOS van en `public/portada/` con el nombre que diga `imagen` (por
 * ejemplo `public/portada/1.jpg`). Si el archivo no existe, la diapositiva
 * NO se rompe: sale la frase sobre el fondo degradado de la marca. Asi se
 * pueden anadir frases hoy y fotos manana, en el orden que sea.
 *
 * Para anadir una frase basta con anadir una entrada aqui; el carrusel, las
 * flechas y los puntos se ajustan solos.
 */
export interface DiapositivaPortada {
  frase: string;
  /// Autor o fuente, si la tiene. Se pinta pequeno bajo la frase.
  autor?: string;
  /// Ruta dentro de `public/` (ej. "/portada/1.jpg").
  imagen: string;
}

export const DIAPOSITIVAS_PORTADA: readonly DiapositivaPortada[] = [
  {
    frase:
      "El plan maestro es la meta; el Last Planner es el camino diario para llegar a ella.",
    imagen: "/portada/1.jpg",
  },
  {
    frase: "Pasar del «deberia» al «puede» es el puente hacia el compromiso real.",
    imagen: "/portada/2.jpg",
  },
  {
    frase: "El PPC mide nuestra confiabilidad, no nuestra velocidad.",
    imagen: "/portada/3.jpg",
  },
  {
    frase:
      "Una restriccion no identificada es un obstaculo que detendra la obra manana.",
    imagen: "/portada/4.jpg",
  },
  {
    frase: "Lo que no se mide, no se puede mejorar.",
    autor: "Atribuida a Peter Drucker",
    imagen: "/portada/5.jpg",
  },
  {
    frase: "No hay nada tan inutil como hacer eficientemente lo que no deberia hacerse.",
    autor: "Peter Drucker",
    imagen: "/portada/6.jpg",
  },
  {
    frase: "Planificar no es predecir el futuro: es prepararse para cumplirlo.",
    imagen: "/portada/7.jpg",
  },
  {
    frase: "La semana se gana el martes, cuando se liberan las restricciones del jueves.",
    imagen: "/portada/8.jpg",
  },
  {
    frase: "Prometer poco y cumplirlo vale mas que prometer todo y fallar la mitad.",
    imagen: "/portada/9.jpg",
  },
  {
    frase: "Cada causa de no cumplimiento anotada es una leccion que la obra no repetira.",
    imagen: "/portada/10.jpg",
  },
  {
    frase: "El desperdicio mas peligroso es el que no vemos.",
    autor: "Shigeo Shingo",
    imagen: "/portada/11.jpg",
  },
  {
    frase: "La confianza se construye igual que un muro: hilada por hilada, semana a semana.",
    imagen: "/portada/12.jpg",
  },
];

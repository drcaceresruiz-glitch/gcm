"use client";

import { Component, Suspense, useEffect, useRef, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, useGLTF, useAnimations } from "@react-three/drei";
import type { Group } from "three";

/**
 * El avatar 3D — primera pieza WebGL de GCM, a proposito minima.
 *
 * PLACEHOLDER TECNICO, no el diseño final: un personaje generico y
 * gratuito (un obrero de Quaternius, licencia CC0 -dominio publico,
 * atribucion voluntaria, ver el pie de la tarjeta-) para probar la
 * tuberia completa -carga, animacion, integracion con el chat- antes de
 * invertir en el diseño definitivo de "Mike". Se reemplaza el archivo de
 * `public/mike/` el dia que exista ese diseño, sin tocar este componente.
 *
 * Primer intento (22 de agosto de 2026) uso CesiumMan -un astronauta de
 * muestra de Khronos-, rechazado por el usuario por no parecerse en nada
 * a alguien de obra. Este es CC0 y SI trae casco y chaleco reflectante.
 *
 * El encuadre de camara usa `Bounds` de drei (calcula el recuadro real
 * del modelo cargado y ajusta la camara sola) en vez de numeros de
 * escala/posicion a mano: la vez anterior, ajustar esos numeros a ciegas
 * para un modelo distinto hizo que el personaje desapareciera sin ningun
 * error en consola. Con `Bounds`, cambiar el archivo GLB el dia de manana
 * -incluido el reemplazo por el diseño final- no rompe el encuadre.
 *
 * Sin voz, sin sincronizado de labios (decision del usuario, 22 de agosto
 * de 2026): solo gesticula mientras el texto aparece en la burbuja de
 * siempre.
 */

const RUTA_MODELO = "/mike/mike-placeholder.glb";
const CLIP_REPOSO = "CharacterArmature|Idle";
const CLIP_ACTIVO = "CharacterArmature|Wave";

function hayWebGL(): boolean {
  try {
    const lienzo = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (lienzo.getContext("webgl") || lienzo.getContext("experimental-webgl")),
    );
  } catch {
    return false;
  }
}

function Personaje({ activo }: { activo: boolean }) {
  const grupo = useRef<Group>(null);
  const { scene, animations } = useGLTF(RUTA_MODELO);
  const { actions } = useAnimations(animations, grupo);

  useEffect(() => {
    const nombreClip = actions[activo ? CLIP_ACTIVO : CLIP_REPOSO] ? (activo ? CLIP_ACTIVO : CLIP_REPOSO) : CLIP_REPOSO;
    const accion = actions[nombreClip];
    accion?.reset().fadeIn(0.3).play();
    return () => {
      accion?.fadeOut(0.3);
    };
  }, [actions, activo]);

  return <primitive ref={grupo} object={scene} />;
}

useGLTF.preload(RUTA_MODELO);

class LimiteDeError extends Component<{ children: ReactNode }, { fallo: boolean }> {
  override state = { fallo: false };

  static getDerivedStateFromError() {
    return { fallo: true };
  }

  override render() {
    // Si el avatar falla -un modelo que no carga, un driver de WebGL raro
    // en un equipo de obra viejo-, se cae en silencio: el chat de texto
    // de siempre sigue funcionando igual, nunca se rompe la pantalla
    // entera por esto.
    if (this.state.fallo) return null;
    return this.props.children;
  }
}

/** El avatar, o nada -nunca un espacio roto- si el navegador no tiene WebGL. */
export default function AvatarMike({ activo }: { activo: boolean }) {
  if (typeof window === "undefined" || !hayWebGL()) return null;

  return (
    <LimiteDeError>
      <div
        className="h-40 w-full overflow-hidden rounded-xl"
        style={{ backgroundColor: "var(--fondo)", border: "1px solid var(--borde)" }}
      >
        <Canvas dpr={[1, 1.5]} camera={{ fov: 35 }}>
          <ambientLight intensity={0.9} />
          <directionalLight position={[2, 4, 3]} intensity={1.2} />
          <Suspense fallback={null}>
            <Bounds fit clip observe margin={1.3}>
              <Personaje activo={activo} />
            </Bounds>
          </Suspense>
        </Canvas>
      </div>
      <p className="mt-1 text-right text-[10px] opacity-40">
        Modelo de prueba: Worker (Quaternius, CC0 — dominio publico)
      </p>
    </LimiteDeError>
  );
}

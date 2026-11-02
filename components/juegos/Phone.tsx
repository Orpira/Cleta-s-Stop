import Image from 'next/image';

/**
 * Captura de pantalla completa (390×844) dentro de un marco de móvil con la
 * misma proporción, así la imagen nunca se recorta. La altura la decide el
 * contenedor (.phone usa aspect-ratio).
 */
export function Phone({ src, sizes, priority }: { src: string; sizes: string; priority?: boolean }) {
  return (
    <div className="phone">
      <div className="phone-screen">
        <Image src={src} alt="" fill sizes={sizes} priority={priority} />
      </div>
    </div>
  );
}

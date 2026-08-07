import { Sheet } from '../../components/ui/Sheet';

export default function JuegosPage() {
  return (
    <Sheet brand="orpira.es">
      <h1 className="title" style={{ fontSize: 36 }}>Juegos</h1>
      <p className="subtitle">Elige a qué quieres jugar.</p>

      <div className="player-chip">
        <span>¡Stop! — el clásico juego de papel, en línea y multijugador</span>
        <a href="/juegos/stop" style={{ color: 'var(--ink-blue)', fontWeight: 700 }}>Jugar →</a>
      </div>

      <div className="player-chip">
        <span>Categorías rápidas — Stop con un banco de 20 categorías, sorteadas cada ronda</span>
        <a href="/juegos/categorias-rapidas" style={{ color: 'var(--ink-blue)', fontWeight: 700 }}>Jugar →</a>
      </div>
    </Sheet>
  );
}

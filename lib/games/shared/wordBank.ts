// Banco de palabras de ejemplo para las "pistas" opcionales durante la
// ronda (settings.show_hints). Cobertura best-effort: no todas las
// combinaciones categoría+letra tienen una palabra (algunas letras no
// tienen ejemplo común en español); getHintWord() devuelve null en ese
// caso y el ticker simplemente la salta.
//
// Nota: se evitan deliberadamente palabras cuya PRIMERA letra lleva tilde
// (p.ej. "Óscar", "Úrsula") porque la validación automática del juego
// (auto_nonempty) compara el carácter literal y "ÓSCAR".startsWith("O")
// es false en JS.

export const WORD_BANK: Record<string, Record<string, string>> = {
  Nombre: {
    A: 'Ana', B: 'Beatriz', C: 'Carlos', D: 'Diego', E: 'Elena', F: 'Fernando',
    G: 'Gabriel', H: 'Hugo', I: 'Isabel', J: 'Javier', L: 'Laura', M: 'Miguel',
    N: 'Natalia', O: 'Omar', P: 'Pablo', R: 'Ricardo', S: 'Sofía', T: 'Teresa',
    U: 'Uriel', V: 'Valentina', Y: 'Yolanda', Z: 'Zoe',
  },
  Apellido: {
    A: 'Alonso', B: 'Blanco', C: 'Castro', D: 'Díaz', E: 'Espinoza', F: 'Fernández',
    G: 'García', H: 'Hernández', I: 'Ibáñez', J: 'Jiménez', L: 'López', M: 'Martínez',
    N: 'Navarro', O: 'Ortiz', P: 'Pérez', Q: 'Quintero', R: 'Rodríguez', S: 'Sánchez',
    T: 'Torres', U: 'Ulloa', V: 'Vargas', Y: 'Yáñez', Z: 'Zapata',
  },
  Animal: {
    A: 'Araña', B: 'Búho', C: 'Caballo', D: 'Delfín', E: 'Elefante', F: 'Foca',
    G: 'Gato', H: 'Hipopótamo', I: 'Iguana', J: 'Jaguar', L: 'León', M: 'Mono',
    N: 'Nutria', O: 'Oso', P: 'Perro', Q: 'Quetzal', R: 'Rana', S: 'Serpiente',
    T: 'Tigre', U: 'Urraca', V: 'Vaca', Y: 'Yak', Z: 'Zorro',
  },
  Fruta: {
    A: 'Aguacate', B: 'Banana', C: 'Cereza', D: 'Dátil', E: 'Endrina', F: 'Frambuesa',
    G: 'Guayaba', H: 'Higo', I: 'Icaco', J: 'Jaca', L: 'Limón', M: 'Mango',
    N: 'Naranja', O: 'Oliva', P: 'Pera', S: 'Sandía', T: 'Toronja', U: 'Uva',
  },
  Color: {
    A: 'Amarillo', B: 'Blanco', C: 'Celeste', D: 'Dorado', F: 'Fucsia', G: 'Gris',
    L: 'Lila', M: 'Magenta', N: 'Negro', O: 'Ocre', P: 'Púrpura', R: 'Rojo',
    S: 'Salmón', T: 'Turquesa', V: 'Verde',
  },
  Ciudad: {
    A: 'Asunción', B: 'Barcelona', C: 'Caracas', D: 'Dublín', E: 'El Cairo',
    F: 'Florencia', G: 'Granada', H: 'Hamburgo', I: 'Ibiza', J: 'Jerusalén',
    L: 'Lima', M: 'Madrid', N: 'Nápoles', O: 'Oslo', P: 'París', Q: 'Quito',
    R: 'Roma', S: 'Sevilla', T: 'Toledo', U: 'Utrecht', V: 'Valencia',
    Y: 'Yakarta', Z: 'Zaragoza',
  },
  Cosa: {
    A: 'Almohada', B: 'Botella', C: 'Cuchara', D: 'Destornillador', E: 'Escoba',
    F: 'Farol', G: 'Guitarra', H: 'Hamaca', I: 'Impresora', J: 'Jarrón',
    L: 'Lámpara', M: 'Mesa', N: 'Nevera', O: 'Olla', P: 'Plato', R: 'Reloj',
    S: 'Silla', T: 'Taza', V: 'Vaso', Z: 'Zapato',
  },
  Comida: {
    A: 'Arroz', B: 'Bistec', C: 'Croqueta', D: 'Donut', E: 'Empanada', F: 'Flan',
    G: 'Gazpacho', H: 'Hamburguesa', J: 'Jamón', L: 'Lasaña', M: 'Milanesa',
    N: 'Nachos', O: 'Omelette', P: 'Pizza', Q: 'Quesadilla', R: 'Ravioles',
    S: 'Sopa', T: 'Taco', V: 'Verduras',
  },
  Deporte: {
    A: 'Atletismo', B: 'Baloncesto', C: 'Ciclismo', D: 'Dardos', E: 'Esgrima',
    F: 'Fútbol', G: 'Golf', H: 'Hockey', J: 'Judo', L: 'Lucha', M: 'Motociclismo',
    N: 'Natación', P: 'Pádel', R: 'Rugby', S: 'Surf', T: 'Tenis', V: 'Voleibol',
  },
  'Película': {
    A: 'Avatar', B: 'Batman', C: 'Cars', D: 'Dune', E: 'Elf', F: 'Frozen',
    G: 'Gladiador', H: 'Halloween', I: 'It', J: 'Jaws', L: 'Luca', M: 'Matrix',
    N: 'Nemo', O: 'Oldboy', P: 'Psicosis', R: 'Rocky', S: 'Shrek', T: 'Titanic',
    U: 'Up', V: 'Vértigo', Z: 'Zootopia',
  },
  'Profesión': {
    A: 'Abogado', B: 'Bombero', C: 'Cocinero', D: 'Dentista', E: 'Electricista',
    F: 'Fontanero', G: 'Granjero', I: 'Ingeniero', J: 'Jardinero', M: 'Médico',
    N: 'Notario', P: 'Piloto', R: 'Recepcionista', S: 'Soldador', T: 'Taxista',
    V: 'Veterinario',
  },
  Marca: {
    A: 'Adidas', B: 'BMW', C: 'Coca-Cola', D: 'Dell', E: 'Ebay', F: 'Ferrari',
    G: 'Google', H: 'Honda', I: 'Ikea', J: 'Jeep', L: 'Lego', M: 'Microsoft',
    N: 'Nike', O: 'Oreo', P: 'Pepsi', R: 'Reebok', S: 'Samsung', T: 'Toyota',
    V: 'Volvo', Y: 'Yamaha', Z: 'Zara',
  },
  'Instrumento musical': {
    A: 'Acordeón', B: 'Batería', C: 'Clarinete', F: 'Flauta', G: 'Guitarra',
    L: 'Laúd', M: 'Maracas', O: 'Oboe', P: 'Piano', S: 'Saxofón', T: 'Tambor',
    U: 'Ukelele', V: 'Violín', Z: 'Zampoña',
  },
  'País': {
    A: 'Argentina', B: 'Bolivia', C: 'Chile', D: 'Dinamarca', E: 'Ecuador',
    F: 'Francia', G: 'Grecia', H: 'Honduras', I: 'India', J: 'Japón',
    L: 'Líbano', M: 'México', N: 'Nicaragua', O: 'Omán', P: 'Perú', Q: 'Qatar',
    R: 'Rusia', S: 'Suecia', T: 'Turquía', U: 'Uruguay', V: 'Venezuela',
    Y: 'Yemen', Z: 'Zambia',
  },
  'Objeto escolar': {
    A: 'Agenda', B: 'Borrador', C: 'Cuaderno', D: 'Diccionario', E: 'Estuche',
    G: 'Goma', L: 'Lápiz', M: 'Mochila', P: 'Pegamento', R: 'Regla',
    S: 'Sacapuntas', T: 'Tijeras',
  },
  'Superhéroe': {
    A: 'Aquaman', B: 'Batman', C: 'Capitán América', D: 'Deadpool', E: 'Elektra',
    F: 'Flash', G: 'Gambito', H: 'Hulk', I: 'Iron Man', J: 'Jean Grey',
    L: 'Loki', M: 'Magneto', N: 'Nightwing', R: 'Robin', S: 'Spiderman',
    T: 'Thor', V: 'Vision', Z: 'Zatanna',
  },
  'Serie de TV': {
    A: 'Alias', B: 'Breaking Bad', C: 'Chernobyl', D: 'Dexter', E: 'Euphoria',
    F: 'Friends', G: 'Glee', H: 'House', J: 'Jane the Virgin', L: 'Lost',
    M: 'Merlí', N: 'Narcos', O: 'Ozark', P: 'Prison Break', R: 'Reacher',
    S: 'Sherlock', V: 'Vikings',
  },
  Videojuego: {
    A: 'Among Us', B: 'Bioshock', C: 'Celeste', D: 'Doom', E: 'Elden Ring',
    F: 'Fortnite', G: 'God of War', H: 'Halo', I: 'Inside', J: 'Journey',
    L: 'Limbo', M: 'Minecraft', N: 'Nier', O: 'Overwatch', P: 'Portal',
    Q: 'Quake', R: 'Rayman', S: 'Sims', T: 'Tetris', U: 'Undertale',
    V: 'Valorant', Z: 'Zelda',
  },
  Bebida: {
    A: 'Agua', B: 'Batido', C: 'Café', D: 'Daiquiri', E: 'Espresso', F: 'Fanta',
    G: 'Ginebra', J: 'Jugo', L: 'Limonada', M: 'Mojito', N: 'Néctar',
    P: 'Ponche', R: 'Ron', S: 'Sangría', T: 'Té', V: 'Vodka', Y: 'Yerba mate',
  },
  'Personaje histórico': {
    A: 'Aristóteles', B: 'Bolívar', C: 'Colón', D: 'Darwin', E: 'Einstein',
    F: 'Freud', G: 'Gandhi', H: 'Hipócrates', I: 'Isabel la Católica',
    J: 'Julio César', L: 'Lincoln', M: 'Mandela', N: 'Napoleón', P: 'Platón',
    R: 'Robespierre', S: 'Sócrates', T: 'Tutankamón', V: 'Victoria',
  },
};

export function getHintWord(category: string, letter: string): string | null {
  return WORD_BANK[category]?.[letter.toUpperCase()] || null;
}

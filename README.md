# Sonido visible

Un lápiz dibuja el sonido como un sismógrafo y, debajo, lo convierte en paisaje. Canvas 2D y JavaScript puros, sin librerías ni imágenes externas. El papel, el grafito y el lápiz se generan con código.

## Uso

```sh
pnpm start            # servidor estático en 127.0.0.1:4400 (PORT para cambiarlo)
pnpm shot 8,24        # arranca la canción, captura en esos segundos y mide el costo por cuadro (BTN=#demo para la demo)
```

El micrófono sólo funciona en HTTPS (o localhost).

Vista previa temporal: unidad de usuario transitoria `sonido-visible-preview.service`, en loopback 4400 y publicada sólo en la tailnet en `https://omarchy.tailff08b5.ts.net:30443`. Para retirarla: `systemctl --user stop sonido-visible-preview` y `tailscale serve --https=30443 off`.

## Cómo se traduce el sonido

- **Cinta del sismógrafo:** la forma de onda cruda, con perforaciones y marcas de tiempo cada 5 s.
- **Graves (40–250 Hz) → cordillera:** altura, picos y sombreado; las cumbres altas quedan nevadas.
- **Medios (250–2000 Hz) → colinas** delante de la cordillera, y sus ataques plantan pinos.
- **Agudos (2,5–9 kHz):** cada ataque suelta pájaros que levantan vuelo desde el lápiz.
- **Un golpe fuerte de volumen → sol** (como mucho uno cada 12 s, y nunca detrás de una montaña).
- **Ruido sin tono en los agudos (lluvia, un «shhh») → lluvia** que cae hasta la cresta más cercana, con nubes de tormenta sombreadas.
- **Golpe fuerte con ruido (trueno) → rayo:** destello del papel, el lápiz tiembla y queda la marca tenue del rayo.
- **Medios sostenidos sin ruido (acordes largos) → nubes.**
- **Silencio → lago:** el valle se llena de agua, con ondas en tinta azul y el reflejo de la cordillera.

Cada banda se normaliza contra un piso de ruido y un pico que se adaptan solos, así funciona con micrófonos distintos.

## Fuentes

- **Canción para lápiz** (`js/song.js`): 26 compases en La menor a 96 BPM, unos 65 s en bucle, escrita para el paisaje. Seis partes: I. Agua quieta (silencio y colchón: lago y nubes), II. Cordillera (bajo y melodía), III. Bandada (llamados de pájaros), IV. Tormenta (lluvia, bajo picado y truenos), V. Claro (acorde fuerte: sol) y VI. Lago (se apaga). El nombre de cada parte queda anotado en la cinta. Todo se sintetiza en vivo con Web Audio.
- Micrófono, archivo de audio (en bucle) y una demo generativa que recorre cordillera, bosque, bandada, llanura y tormenta.
- Teclado: `Z–M` graves (se sostienen), `A–L` medios, `Q–P` trinos agudos.
- Arrastrar sobre la hoja: theremín (arriba agudo, abajo grave).
- Guardar PNG exporta la hoja con papel, título y fecha. Hoja nueva la limpia.

## Cómo está hecho

El papel avanza a 72 px/s bajo un lápiz fijo. Cinta y paisaje se dibujan de a poco en dos lienzos circulares; sólo se pinta lo nuevo y se borra lo que el lápiz todavía no alcanzó, y la pantalla los copia en cada cuadro. Las colinas borran (`destination-out`) lo que tapan; árboles y soles se dibujan con demora para que el borrado no los corte. Costo medido en Chromium headless a 1440×900: p95 ≈ 1,2 ms de trabajo por cuadro.

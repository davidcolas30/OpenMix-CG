# Manual de usuario

Este manual describe el uso básico de OpenMix-CG desde el punto de vista del
operador: arranque del mixer, conexión de cámaras móviles, selección de fuentes,
uso de grafismos, grabación local, audio de diagnóstico y atajos de teclado.

## Vista general de la aplicación

OpenMix-CG se organiza como una sala de control de realización en directo. La
interfaz principal está dividida en varias vistas:

- **Mixer**: vista principal de realización. Contiene los monitores Preview y
  Program, la multiview, los controles CUT/AUTO, el panel de cámaras WebRTC, los
  vídeos locales y los controles rápidos de grafismo.
- **Audio**: panel de diagnóstico para entrada de audio local, visualización de
  onda y ajuste de delay para la grabación.
- **Grafismo**: editor de plantillas, campos de texto, posición, pila de
  grafismos y salida hacia Preview o Program.
- **Opciones**: configuración de monitorización y grabación local.
- **Atajos**: configuración de teclas rápidas para operaciones frecuentes.

En la parte superior de la ventana se encuentran los controles globales:

- **Iniciar Mixer**: arranca el motor de vídeo y habilita la operación de
  fuentes.
- **Detener**: detiene el mixer y libera las rutas de media.
- **REC / Stop REC**: inicia o detiene la grabación local del Program.
- **Estado de grabación**: muestra duración, tamaño aproximado, contenedor y
  preset activo.

## Flujo básico de operación

Un flujo típico de uso de OpenMix-CG es el siguiente:

1. Abrir la aplicación.
2. Pulsar **Iniciar Mixer**.
3. Conectar una o varias cámaras móviles desde el panel **Cámaras WebRTC**.
4. Seleccionar una fuente en **Preview**.
5. Enviarla a **Program** mediante **CUT** o **AUTO**.
6. Añadir vídeos locales o grafismos si la producción lo requiere.
7. Configurar la grabación en **Opciones**.
8. Pulsar **REC** para grabar la señal Program.
9. Detener la grabación y, al finalizar, detener el mixer.

La lógica principal sigue el paradigma habitual de realización:

- **Preview** muestra la fuente preparada.
- **Program** muestra la señal activa, es decir, lo que se considera salida
  final.
- **CUT** hace un cambio directo.
- **AUTO** ejecuta una transición con duración configurable.

## Arranque y parada del mixer

Antes de usar cámaras, vídeos locales, multiview o grabación, debe iniciarse el
mixer.

Para arrancar:

1. Pulsar **Iniciar Mixer** en la parte superior derecha.
2. Esperar a que aparezcan los monitores Preview, Program y la multiview.
3. Comprobar que las fuentes iniciales están disponibles.

Para detener:

1. Detener primero la grabación si está activa.
2. Pulsar **Detener**.
3. Esperar a que la interfaz vuelva al estado inactivo.

Si el mixer no está iniciado, algunas acciones aparecen desactivadas. Esto es
normal: la aplicación evita cargar fuentes o modificar rutas de media cuando el
pipeline no está activo.

## Monitores Preview, Program y multiview

La vista **Mixer** contiene los elementos principales de realización:

- **Preview**: monitor de preparación. Aquí se coloca la fuente que se quiere
  revisar antes de emitirla.
- **Program**: monitor de salida activa. Representa la señal que se graba y que
  se considera al aire.
- **Multiview**: tira inferior donde se pueden ver varias fuentes a la vez.

Las fuentes se identifican por número y nombre. En la interfaz se utilizan
colores para distinguir su estado:

- Fuente en **Program**: marcada como PGM.
- Fuente en **Preview**: marcada como PVW.
- Fuentes no seleccionadas: disponibles para preselección.

Para enviar una fuente a Preview:

1. Hacer clic sobre la fuente en la multiview.
2. O pulsar el botón numérico correspondiente en la columna de selección PVW.
3. Comprobar que el monitor Preview muestra la fuente esperada.

La multiview puede redimensionarse arrastrando su separador. También existe un
conmutador **Slot GFX** para mostrar u ocultar una referencia del slot de
grafismo dentro de esa zona.

## Cambio de fuente: CUT y AUTO

OpenMix-CG ofrece dos formas principales de pasar una fuente de Preview a
Program.

### CUT

El botón **CUT** intercambia directamente Preview y Program. Es un corte
instantáneo, sin transición progresiva.

Uso recomendado:

1. Seleccionar una fuente en Preview.
2. Comprobar el encuadre o contenido.
3. Pulsar **CUT**.
4. La fuente pasa a Program.

### AUTO

El bloque **AUTO** permite lanzar una transición temporal. La interfaz permite
seleccionar:

- Tipo de transición disponible.
- Duración en milisegundos.

Uso recomendado:

1. Seleccionar una fuente en Preview.
2. Elegir la transición y su duración.
3. Pulsar **AUTO**.
4. Esperar a que finalice la transición antes de lanzar otra.

Mientras una transición está en curso, algunos controles quedan bloqueados
temporalmente para evitar estados incoherentes.

## Conexión de cámaras móviles mediante QR

El panel **Cámaras WebRTC** permite añadir teléfonos móviles como fuentes de
vídeo sin instalar una aplicación específica.

Para conectar una cámara:

1. En la vista **Mixer**, localizar el panel **Cámaras WebRTC**.
2. Pulsar **Añadir cámara**.
3. La aplicación genera un código QR temporal.
4. Escanear el QR con el móvil.
5. Abrir el enlace en el navegador del teléfono.
6. Aceptar los permisos de cámara y micrófono si el navegador los solicita.
7. Esperar a que la cámara aparezca como peer conectado.
8. Seleccionar la fuente correspondiente en Preview.

El QR contiene un token temporal de conexión. Cuando el móvil lo usa
correctamente, la aplicación retira el QR para evitar reutilizar un código
antiguo.

Desde la lista de cámaras se puede ver el estado de cada peer y eliminar una
conexión si ya no se necesita.

Recomendaciones de uso:

- Usar una red Wi-Fi local estable.
- Mantener el móvil con batería suficiente o conectado a corriente.
- Evitar bloquear la pantalla del móvil durante la transmisión.
- Conectar primero una cámara y comprobar fluidez antes de añadir más fuentes.

## Uso de vídeos locales como fuentes

El panel **Vídeo local** permite cargar ficheros de vídeo en slots del mixer.
Estos vídeos se comportan como fuentes pinchables, igual que una cámara.

Los vídeos locales se cargan en los slots disponibles de fuente 2 a fuente 4. La
fuente 1 queda reservada para la fuente base de prueba.

Para cargar un vídeo:

1. Iniciar el mixer.
2. En el panel **Vídeo local**, elegir el slot de destino.
3. Pulsar **Elegir**.
4. Seleccionar el fichero de vídeo.
5. Pulsar **Cargar**.
6. La fuente queda disponible en el mixer.

Controles disponibles por vídeo:

- **Play/Pause**: pausa o reanuda la reproducción.
- **Reiniciar**: vuelve al inicio del vídeo.
- **Loop**: activa o desactiva la reproducción en bucle.
- **AUTO**: activa el modo de reproducción automática al entrar en Program y
  pausa al salir.
- **Quitar**: libera el slot.

El vídeo local no se reproduce desde la interfaz React. La aplicación solo envía
la orden de carga; la decodificación se realiza en GStreamer.

## Grafismos y rótulos

OpenMix-CG incluye un módulo de grafismo para insertar rótulos, faldones,
tickers u otros overlays sobre la imagen.

La vista **Grafismo** contiene:

- **Preview de pila**: previsualización del conjunto de grafismos cargados.
- **Plantillas**: lista de plantillas disponibles.
- **Pila de grafismos**: instancias cargadas y preparadas.
- **Campos**: datos editables de la plantilla seleccionada.
- **Salida Preview/Program**: selección de dónde se superpone el grafismo.
- **Diagnóstico de paint**: información técnica de rendimiento del renderizado.

Para añadir un grafismo:

1. Ir a la vista **Grafismo**.
2. En **Plantillas**, pulsar **Añadir** sobre la plantilla deseada.
3. Seleccionar la instancia creada en la pila.
4. Editar sus campos de texto o datos.
5. Elegir si se superpone sobre **Preview**, sobre **Program** o sobre ambos.
6. Ajustar la posición arrastrando el grafismo en la previsualización o usando
   **Centrar seleccionada**.
7. Pulsar **Subir overlay** para mostrarlo.
8. Pulsar **Bajar overlay** para retirarlo.

En la vista **Mixer** también aparece un panel rápido de **Grafismos**. Desde
ahí se pueden seleccionar, subir o bajar grafismos sin entrar en la vista
completa.

Estados principales:

- **PRESET**: grafismo cargado y preparado, pero no visible.
- **ON AIR**: grafismo visible en la salida configurada.
- **Sin salida**: grafismo cargado pero no enviado ni a Preview ni a Program.

## Grabación local

La grabación local se controla desde el botón **REC** de la barra superior y se
configura desde la vista **Opciones**.

La grabación toma como base la señal **Program**, por lo que recoge la fuente
activa y los grafismos que estén superpuestos sobre Program.

Para configurar la grabación:

1. Entrar en **Opciones**.
2. Elegir la carpeta de destino o dejar la carpeta automática.
3. Seleccionar el contenedor:
   - **MP4**: mayor compatibilidad para reproducción y entrega rápida.
   - **MKV**: más tolerante ante cierres inesperados.
4. Elegir el preset de compresión:
   - **Veryfast**: menor carga de CPU, archivo más grande.
   - **Fast**: equilibrio entre coste y tamaño.
   - **Medium**: mejor compresión, mayor consumo.
5. Ajustar el valor **CRF** si se desea controlar la calidad.

Para grabar:

1. Iniciar el mixer.
2. Comprobar Program.
3. Pulsar **REC**.
4. Durante la grabación, los ajustes quedan bloqueados.
5. Pulsar **Stop REC** para finalizar.

La interfaz muestra duración, tamaño aproximado, contenedor y preset activo.

## Panel de audio y calibración por claqueta

La vista **Audio** está orientada a diagnóstico y ajuste de audio local. No
sustituye a una mesa de sonido completa, pero permite visualizar una entrada de
audio, detectar picos y aplicar un delay a la rama de audio local usada en REC.

Funciones principales:

- **Actualizar**: refresca la lista de dispositivos de audio.
- **Capturar**: inicia la captura de la entrada seleccionada.
- **Detener**: para la captura de audio.
- **Entrada**: permite seleccionar el dispositivo.
- **Onda**: muestra el historial de señal y picos detectados.
- **Referencia visual**: monitor ligero de Preview para marcar una claqueta o
  palmada.
- **Delay manual**: permite introducir un retardo en milisegundos.
- **Aplicar REC**: aplica el delay al audio local de grabación.

Uso básico para calibrar con claqueta:

1. Iniciar el mixer.
2. Entrar en **Audio**.
3. Seleccionar la fuente visual de referencia.
4. Activar el monitor de referencia si está disponible.
5. Pulsar **Capturar** para iniciar la entrada de audio.
6. Activar la detección de picos si se va a usar una palmada o claqueta.
7. Realizar una palmada visible y audible.
8. Seleccionar el frame visual correspondiente en el buffer.
9. Revisar el delay sugerido.
10. Aplicarlo a REC si el resultado es correcto.

El panel permite congelar y reanudar el buffer visual para escoger con calma el
frame más representativo.

## Atajos de teclado

La vista **Atajos** permite configurar acciones frecuentes sin añadir más
botones al mixer principal.

Acciones disponibles:

- **CUT**.
- **AUTO**.
- Enviar fuente 1, 2, 3 o 4 a Preview.
- Mostrar el grafismo seleccionado.
- Ocultar el grafismo seleccionado.
- Alternar Play/Pause del vídeo local cargado en Preview.
- Reiniciar el vídeo local cargado en Preview.

Atajos por defecto:

| Acción | Tecla por defecto |
|---|---|
| CUT | Espacio |
| AUTO | Enter |
| Fuente 1 a Preview | 1 |
| Fuente 2 a Preview | 2 |
| Fuente 3 a Preview | 3 |
| Fuente 4 a Preview | 4 |
| Mostrar grafismo seleccionado | G |
| Ocultar grafismo seleccionado | Shift + G |
| Play/Pause vídeo en Preview | P |
| Reiniciar vídeo en Preview | R |

Para cambiar un atajo:

1. Entrar en **Atajos**.
2. Buscar la acción.
3. Pulsar **Asignar** o **Cambiar**.
4. Pulsar la nueva combinación de teclas.

Durante la captura:

- **Escape** cancela la captura.
- **Backspace** o **Delete** dejan la acción sin tecla.

Los atajos no se ejecutan mientras se escribe en campos de texto.

## Opciones de monitorización

En **Opciones** se puede ajustar la resolución de los monitores Preview y
Program. Esta configuración afecta a la visualización en la interfaz, no a la
ruta interna de grabación.

Si el mixer está activo, algunos cambios se aplican al reiniciar. Esto evita
modificar rutas críticas mientras el pipeline está funcionando.

También existe un botón para **Restablecer valores por defecto**.

## Recomendaciones de uso

Para una prueba básica:

1. Iniciar el mixer.
2. Conectar una cámara móvil.
3. Comprobar que aparece en la multiview.
4. Enviarla a Preview.
5. Hacer CUT a Program.
6. Añadir un grafismo sencillo.
7. Subirlo sobre Program.
8. Iniciar una grabación corta.
9. Detener REC y comprobar el archivo generado.

Para una sesión con varias fuentes:

- Conectar las cámaras una a una.
- Verificar cada fuente en Preview antes de pasarla a Program.
- Usar multiview para comprobar disponibilidad.
- Evitar activar diagnósticos innecesarios durante una grabación importante.
- Preparar los grafismos antes de necesitarlos en directo.
- Configurar carpeta y formato de grabación antes de empezar la producción.

## Limitaciones operativas

Limitaciones relevantes:

- El modo validado principal es el uso local en la misma red.
- La contribución remota con TURN queda como línea futura.
- La mezcla de audio completa multifuente no está cerrada; el panel de audio se
  centra en diagnóstico y audio local para REC.
- Lottie y SVG aparecen como formatos contemplados en el modelo de plantillas,
  pero el soporte principal validado se centra en HTML y en una primera ruta
  nativa para ticker.
- La distribución validada está orientada a macOS y todavía puede depender de
  GStreamer instalado externamente.

Estas limitaciones no impiden utilizar la versión publicada, pero delimitan su
alcance operativo.

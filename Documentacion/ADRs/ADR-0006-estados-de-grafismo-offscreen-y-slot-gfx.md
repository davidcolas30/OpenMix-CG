# ADR-0006: Estados de grafismo offscreen y slot GFX

## Estado

Aceptada.

## Contexto

El motor de grafismo renderiza plantillas HTML/CSS/JS en `BrowserWindow` ocultas con offscreen rendering. Los frames BGRA resultantes se inyectan en GStreamer mediante `appsrc` para que el mixer los componga sobre Preview y Program.

Durante las pruebas de mosca, ticker y reloj apareció un fallo intermitente al subir grafismos:

- a veces se veía primero el grafismo ya colocado en su posición final;
- después se reproducía la animación de entrada;
- otras veces la entrada se saltaba casi completa;
- en bajadas y subidas muy rápidas el problema era más probable.

El problema no era una única animación CSS defectuosa. Era una carrera entre tres estados:

1. el último frame visible que conserva Chromium offscreen o GStreamer;
2. el estado `pre-enter` transparente que debe armar la siguiente entrada;
3. el primer frame real de la animación `animateIn()`.

Si el servicio aceptaba cualquier paint como "frame fresco", un frame viejo en estado final podía desbloquear el overlay antes de tiempo.

## Decisión

Se separan tres conceptos que antes podían confundirse:

- **Visible en salida:** el grafismo está realmente al aire y puede entrar en Preview/Program.
- **Preparado para entrar:** el DOM está en `pre-enter`, transparente, listo para iniciar `animateIn()`.
- **Visible en slot GFX:** el grafismo se muestra como referencia para el realizador aunque no esté al aire.

Para evitar repetir el fallo:

1. Antes de una subida, el servicio marca el item como `awaitingFreshVisibleFrame` y exige un frame transparente si `requireTransparentFrameBeforeUnlock` está activo.
2. Mientras se espera ese frame transparente, se descartan paints con `alphaBounds` visibles, porque pueden ser frames viejos llegados tarde.
3. Si Chromium no entrega a tiempo un frame transparente, el servicio inyecta uno explícito para armar el camino sin mostrar basura visual.
4. Las plantillas no deben quitar `pre-enter` antes de forzar el reflow de entrada. El orden correcto es:

   ```js
   root.classList.remove('animate-in', 'animate-out')
   root.classList.add('pre-enter')
   void root.offsetWidth
   root.classList.add('animate-in')
   root.classList.remove('pre-enter')
   ```

5. Al terminar `animateOut()`, la plantilla vuelve a un estado estable (`pre-enter` o `hidden`) y espera varios `requestAnimationFrame` antes de considerarse asentada.
6. Para el slot GFX se usa un estado `preparePreview()` separado: el grafismo puede verse armado en la multiview sin que `isVisible` pase a `true` ni se mezcle sobre Preview/Program.
7. El slot GFX se modela como `stackPreviewActive`: puede mantener animaciones internas vivas aunque el grafismo esté bajado.
8. Las operaciones `show`/`hide` se serializan en el servicio para evitar que dos entradas lanzadas seguidas compartan frames intermedios o cache de composición.

## Consecuencias

- Las entradas dejan de depender de que Chromium offscreen entregue los paints en un orden ideal.
- Un frame viejo en posición final ya no puede desbloquear la salida.
- El slot GFX puede mostrar los grafismos cargados aunque estén bajados realmente.
- Un ticker puede seguir desplazándose en el slot GFX aunque no esté al aire.
- Si el realizador sube varios grafismos seguidos, cada entrada espera a que la anterior haya dejado el pipeline en un estado coherente.
- El modelo sigue siendo trazable: permite explicar la diferencia entre plano de control, frame offscreen, `appsrc`, composición nativa y estado operativo del grafismo.

## Regla práctica para nuevas plantillas

Toda plantilla animada debe implementar estos métodos de forma coherente:

- `prepareIn()`: deja el grafismo transparente y listo para entrar.
- `animateIn()`: arranca desde `prepareIn`, sin frames intermedios visibles en estado final.
- `animateOut()`: reproduce la salida y deja un estado oculto estable.
- `preparePreview()`: muestra el grafismo armado para el slot GFX sin marcarlo como al aire.

No se debe usar la misma clase CSS para representar a la vez "está al aire", "está preparado para entrar" y "se previsualiza en la multiview".

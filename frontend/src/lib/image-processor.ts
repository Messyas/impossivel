/**
 * Image processing utility for avatar uploads.
 * Accepts images up to 10 MB, crops them 1:1, resizes to a max resolution (default 256x256),
 * and compresses them to lightweight WebP/JPEG Data URLs (~20-50 KB).
 */

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

export interface ImageProcessOptions {
  maxSizePx?: number
  quality?: number
}

export async function processAvatarImage(
  file: File,
  options: ImageProcessOptions = {}
): Promise<string> {
  const { maxSizePx = 256, quality = 0.85 } = options

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`O arquivo excede o limite máximo permitido de 10 MB. (Tamanho atual: ${(file.size / (1024 * 1024)).toFixed(1)} MB)`)
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('O arquivo selecionado não é uma imagem válida.')
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onerror = () => reject(new Error('Falha ao ler o arquivo de imagem.'))

    reader.onload = () => {
      const img = new Image()

      img.onerror = () => reject(new Error('Formato de imagem inválido ou corrompido.'))

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = maxSizePx
          canvas.height = maxSizePx
          const ctx = canvas.getContext('2d')

          if (!ctx) {
            reject(new Error('Não foi possível inicializar o contexto 2D do Canvas.'))
            return
          }

          // Enable smooth scaling
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'

          // Compute 1:1 square center crop
          const srcWidth = img.width
          const srcHeight = img.height
          const minDim = Math.min(srcWidth, srcHeight)
          const srcX = (srcWidth - minDim) / 2
          const srcY = (srcHeight - minDim) / 2

          // Draw cropped & resized image to canvas
          ctx.drawImage(
            img,
            srcX,
            srcY,
            minDim,
            minDim,
            0,
            0,
            maxSizePx,
            maxSizePx
          )

          // Try WebP output first, fall back to JPEG if unsupported
          let dataUrl = canvas.toDataURL('image/webp', quality)
          if (!dataUrl.startsWith('data:image/webp')) {
            dataUrl = canvas.toDataURL('image/jpeg', quality)
          }

          resolve(dataUrl)
        } catch (err) {
          reject(err)
        }
      }

      img.src = String(reader.result)
    }

    reader.readAsDataURL(file)
  })
}

/**
 * LaTeX to PNG rendering via MathJax SVG + sharp
 */

import { CacheManager } from "./cache.js";
export interface RendererAvailability {
  mathjax: boolean;
  sharp: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction = (...args: any[]) => any;

// MathJax module types (loaded dynamically)
type MathJaxModule = {
  mathjax: {
    document: AnyFunction;
    handlers: {
      register: (handler: unknown) => void;
      unregister: (handler: unknown) => void;
    };
  };
  TeX: new (options: unknown) => unknown;
  SVG: new (options: unknown) => unknown;
  liteAdaptor: (options: { fontSize: number }) => {
    outerHTML: (node: unknown) => string;
  };
  RegisterHTMLHandler: (handler: unknown) => unknown;
};

/**
 * Renders LaTeX to PNG images using MathJax for SVG generation
 * and sharp for PNG conversion.
 *
 * Results are cached by content hash.
 */
export class LatexRenderer {
  private readonly cache: CacheManager;
  private availability: RendererAvailability | null = null;
  private warnedMissing = false;
  private mathJaxPromise: Promise<MathJaxModule> | null = null;
  private adaptor: ReturnType<MathJaxModule['liteAdaptor']> | null = null;
  private handler: unknown = null;

  constructor(cache: CacheManager) {
    this.cache = cache;
  }

  /**
   * Detect which renderers are available.
   */
  async detectRenderers(): Promise<RendererAvailability> {
    if (this.availability) {
      return this.availability;
    }

    const mathjax = await this.checkMathJax();
    const sharp = await this.checkSharp();

    this.availability = { mathjax, sharp };
    return this.availability;
  }

  /**
   * Render LaTeX to PNG.
   *
   * Returns base64-encoded PNG data.
   * Returns null if rendering fails (caller should preserve raw LaTeX).
   *
   * The PNG is padded to targetCells * PIXELS_PER_CELL width so that when
   * Pi stretches it to fill imageWidthCells, the content appears at the
   * correct size (not stretched/blurry).
   *
   * @param latex - The LaTeX expression to render
   * @param displayMode - Whether to render in display mode (centered, larger)
   * @param targetCells - Target width in terminal cells (default: 60)
   */
  async render(latex: string, displayMode: boolean, targetCells: number = 60, color = "#000000"): Promise<string | null> {
    if (!Number.isInteger(targetCells) || targetCells < 20 || targetCells > 200) throw new Error("targetCells must be an integer from 20 to 200");
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Invalid formula color");
    if (!latex.trim()) return null;
    const key = this.cache.getKey(latex, displayMode, targetCells, color);

    // Check cache
    const cached = await this.cache.readCached(key);
    if (cached) {
      return cached.toString("base64");
    }

    // Check availability
    const availability = await this.detectRenderers();

    if (!availability.mathjax) {
      if (!this.warnedMissing) {
        console.warn("[pi-latex] MathJax not available.");
        this.warnedMissing = true;
      }
      return null;
    }

    if (!availability.sharp) {
      if (!this.warnedMissing) {
        console.warn("[pi-latex] sharp not available.");
        this.warnedMissing = true;
      }
      return null;
    }

    try {
      const png = await this.renderWithMathJax(latex, displayMode, targetCells, color);
      await this.cache.write(key, png);
      return png.toString("base64");
    } catch (error) {
      console.warn("[pi-latex] Render failed:", error);
      return null;
    }
  }

  /**
   * Initialize MathJax modules.
   */
  private async initMathJax(): Promise<MathJaxModule> {
    if (this.mathJaxPromise) {
      return this.mathJaxPromise;
    }

    this.mathJaxPromise = (async () => {
      // Import MathJax modules from mathjax-full
      const { mathjax } = await import("mathjax-full/js/mathjax.js");
      const { TeX } = await import("mathjax-full/js/input/tex.js");
      const { SVG } = await import("mathjax-full/js/output/svg.js");
      const { liteAdaptor } = await import("mathjax-full/js/adaptors/liteAdaptor.js");
      const { RegisterHTMLHandler } = await import("mathjax-full/js/handlers/html.js");

      // Import package configurations to register them
      // These must be imported so their handlers are available
      await import("mathjax-full/js/input/tex/base/BaseConfiguration.js");
      await import("mathjax-full/js/input/tex/ams/AmsConfiguration.js");
      await import("mathjax-full/js/input/tex/amscd/AmsCdConfiguration.js");
      await import("mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js");
      await import("mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js");
      await import("mathjax-full/js/input/tex/noundefined/NoUndefinedConfiguration.js");
      await import("mathjax-full/js/input/tex/require/RequireConfiguration.js");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { mathjax, TeX, SVG, liteAdaptor, RegisterHTMLHandler } as any;
    })();

    return this.mathJaxPromise;
  }

  /**
   * Render using MathJax SVG + sharp.
   */
  private async renderWithMathJax(latex: string, displayMode: boolean, targetCells: number, color: string): Promise<Buffer> {
    const mj = await this.initMathJax();

    // Create adaptor and register handler (only once)
    if (!this.adaptor || !this.handler) {
      this.adaptor = mj.liteAdaptor({ fontSize: 16 });
      this.handler = mj.RegisterHTMLHandler(this.adaptor);
    }

    // Create input and output jax
    // Load all packages to support \frac, \sqrt, \alpha, etc.
    const tex = new mj.TeX({
      packages: ['base', 'ams', 'amscd', 'boldsymbol', 'newcommand', 'noundefined', 'require']
    });

    const svg = new mj.SVG({
      fontCache: 'none'
    });

    // Create document
    const html = mj.mathjax.document('', {
      InputJax: tex,
      OutputJax: svg
    });

    // Convert to SVG
    const node = html.convert(latex, {
      display: displayMode,
      em: 16,
      ex: 8,
      containerWidth: 80 * 16
    });

    // Get container HTML and extract SVG
    // MathJax may embed nested <svg> elements for glyph paths (e.g., in pmatrix)
    // The outer SVG has xmlns="http://www.w3.org/2000/svg", nested ones don't
    const containerHtml = this.adaptor.outerHTML(node);

    // Extract outer SVG by finding the one with xmlns and matching open/close tags
    if (containerHtml.includes('data-mjx-error=') || containerHtml.includes('data-mml-node="merror"')) {
      throw new Error('Invalid formula');
    }
    let svgString = this.extractOuterSvg(containerHtml);

    if (!svgString) {
      throw new Error('No SVG found in MathJax output');
    }

    // Fix SVG for sharp rendering:
    // Resolve currentColor for headless rendering.
    svgString = svgString.replace(/currentColor/g, color);

    // Size only the outer SVG: nested glyph SVGs retain their own geometry.
    // Render at 75% of the original formula scale to sit closer to terminal text.
    const sharp = (await import("sharp")).default;
    const opening = svgString.match(/^<svg\b[^>]*>/)?.[0];
    const box = opening?.match(/\bviewBox="([^"]+)"/)?.[1].trim().split(/[\s,]+/).map(Number);
    if (!opening || !box || box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) {
      throw new Error('Invalid formula dimensions');
    }
    // Double raster density, including padding; Pi maxWidthCells controls display size.
    const targetWidth = targetCells * 24;
    const scale = Math.min(0.06, targetWidth / box[2]);
    const width = Math.max(1, Math.floor(box[2] * scale));
    const height = Math.max(1, Math.floor(box[3] * scale));
    // Bound the padded allocation too: a narrow, tall glyph can have huge padding.
    // Keep the pixel budget fixed despite the fourfold area at double density.
    if (!Number.isFinite(height) || height > 8192 || targetWidth * height > 8_000_000) throw new Error('Formula dimensions exceed limits');
    const sizedOpening = opening.replace(/\s(?:width|height)="[^"]*"/g, '').replace(/>$/, ` width="${width}" height="${height}">`);
    svgString = sizedOpening + svgString.slice(opening.length);
    const input = Buffer.from(svgString);
    // Native alpha statistics detect blank output without a JS pixel scan or
    // an intermediate PNG encode/decode. Both passes rasterize bounded input.
    const stats = await sharp(input).ensureAlpha().stats();
    if (stats.channels[3].max === 0) throw new Error('Empty formula image');
    const remaining = targetWidth - width;
    const left = Math.min(24, remaining);
    return sharp(input).extend({ left, right: remaining - left,
      background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  }

  private async checkMathJax(): Promise<boolean> {
    try {
      const mj = await import("mathjax-full/js/mathjax.js");
      return mj && typeof mj.mathjax !== 'undefined';
    } catch {
      return false;
    }
  }

  private async checkSharp(): Promise<boolean> {
    try {
      const sharp = await import("sharp");
      return sharp && typeof sharp.default !== 'undefined';
    } catch {
      return false;
    }
  }

  /**
   * Extract the outer SVG from MathJax HTML output.
   * Handles nested SVG elements by counting open/close tags.
   */
  private extractOuterSvg(html: string): string | null {
    // Find the start of the outer SVG (the one with xmlns)
    const startMatch = html.match(/<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*>/);
    if (!startMatch) {
      // Fallback: try any svg tag
      const fallbackStart = html.match(/<svg[^>]*>/);
      if (!fallbackStart) return null;
      return this.extractSvgByParsing(html, fallbackStart.index!);
    }
    return this.extractSvgByParsing(html, startMatch.index!);
  }

  /**
   * Parse SVG from HTML starting at given index.
   * Counts open/close tags to handle nested SVGs correctly.
   */
  private extractSvgByParsing(html: string, startIndex: number): string | null {
    let depth = 0;
    let inTag = false;
    let tagBuffer = '';
    let i = startIndex;

    while (i < html.length) {
      const char = html[i];

      if (char === '<') {
        inTag = true;
        tagBuffer = '<';
      } else if (inTag) {
        tagBuffer += char;
        if (char === '>') {
          inTag = false;
          const tag = tagBuffer.toLowerCase();
          if (tag.startsWith('<svg') && !tag.startsWith('</svg')) {
            depth++;
          } else if (tag === '</svg>') {
            depth--;
            if (depth === 0) {
              // Found the matching close tag
              return html.slice(startIndex, i + 1);
            }
          }
          tagBuffer = '';
        }
      }
      i++;
    }

    return null; // Unbalanced tags
  }

}

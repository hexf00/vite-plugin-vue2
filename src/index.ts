import { TemplateCompileOptions } from '@vue/component-compiler-utils'
import { normalizeComponentCode } from './utils/componentNormalizer'
import { vueHotReloadCode } from './utils/vueHotReload'
import fs from 'fs'
import { parseVueRequest } from './utils/query'
import { createFilter } from '@rollup/pluginutils'
import { transformMain } from './main'
import { compileSFCTemplate } from './template'
import { getDescriptor } from './utils/descriptorCache'
import { transformStyle } from './style'
import { ViteDevServer, Plugin } from 'vite'
import { SFCBlock } from '@vue/component-compiler-utils'
import { transformVueJsx } from './jsxTransform'

export const vueComponentNormalizer = '\0/vite/vueComponentNormalizer'
export const vueHotReload = '\0/vite/vueHotReload'

// extend the descriptor so we can store the scopeId on it
declare module '@vue/component-compiler-utils' {
  interface SFCDescriptor {
    id: string
  }
}

export interface VueViteOptions {
  include?: string | RegExp | (string | RegExp)[]
  exclude?: string | RegExp | (string | RegExp)[]
  /**
   * The options for `@vue/component-compiler-utils`.
   */
  vueTemplateOptions?: Partial<TemplateCompileOptions>
  /**
   * The options for jsx transform
   * @default false
   */
  jsx?: boolean
  /**
   * The options for `@vue/babel-preset-jsx`
   */
  jsxOptions?: Record<string, any>
  /**
   * The options for esbuild to transform script code
   * @default 'esnext'
   * @example 'esnext' | ['esnext','chrome58','firefox57','safari11','edge16','node12']
   */
  target?: string | string[]
}

export interface ResolvedOptions extends VueViteOptions {
  root: string
  devServer?: ViteDevServer
  isProduction: boolean
  target?: string | string[]
}

export function createVuePlugin (rawOptions: VueViteOptions = {}): Plugin {
  const options: ResolvedOptions = {
    isProduction: process.env.NODE_ENV === 'production',
    ...rawOptions,
    root: process.cwd(),
  }

  const filter = createFilter(options.include || /\.vue$/, options.exclude)

  return {
    name: 'vite-plugin-vue2',

    config (config) {
      if (options.jsx) {
        return {
          esbuild: {
            include: /\.ts$/,
            exclude: /\.(tsx|jsx)$/,
          },
        }
      }
    },

    handleHotUpdate (ctx) {
      // console.log('---handleHotUpdate---', ctx.file, ctx.modules.map(it => it.acceptedHmrDeps))
      // 返回空数组  是不处理热更新
      // 返回undefined  是默认行为 依据ctx.module处理?
      return

      // 旧代码，只处理vue的热更新
      // if (!filter(ctx.file)) {
      //   return
      // }
      // return handleHotUpdate(ctx, options)
    },

    configResolved (config) {
      options.isProduction = config.isProduction
      options.root = config.root
    },

    configureServer (server) {
      options.devServer = server
    },

    async resolveId (id) {
      if (id === vueComponentNormalizer || id === vueHotReload) {
        return id
      }
      // serve subpart requests (*?vue) as virtual modules
      if (parseVueRequest(id).query.vue) {
        return id
      }
    },

    load (id) {
      if (id === vueComponentNormalizer) {
        return normalizeComponentCode
      }

      if (id === vueHotReload) {
        return vueHotReloadCode
      }

      const { filename, query } = parseVueRequest(id)
      // select corresponding block for subpart virtual modules
      if (query.vue) {
        // 处理vue的虚拟文件
        if (query.src) {
          return fs.readFileSync(filename, 'utf-8')
        }
        const descriptor = getDescriptor(filename)!
        let block: SFCBlock | null | undefined

        if (query.type === 'script') {
          block = descriptor.script!
        } else if (query.type === 'template') {
          block = descriptor.template!
        } else if (query.type === 'style') {
          block = descriptor.styles[query.index!]
        } else if (query.index != null) {
          block = descriptor.customBlocks[query.index]
        }
        if (block) {
          return {
            code: block.content,
            map: block.map as any,
          }
        }
      }
    },

    async transform (code, id, transformOptions) {
      const { filename, query } = parseVueRequest(id)

      if (/\.(tsx|jsx)$/.test(id)) {
        // TSX进入该逻辑
        return transformVueJsx(code, id, options)
      }

      if ((!query.vue && !filter(filename)) || query.raw) {
        // 默认文件进入该逻辑
        return
      }

      if (!query.vue) {
        // 在transformMain 中 vue文件会被分成 template 、script 、style等几个不同的 虚拟模块
        // main request
        return await transformMain(code, filename, options, this)
      }

      const descriptor = getDescriptor(
        query.from ? decodeURIComponent(query.from) : filename
      )!
      // sub block request
      if (query.type === 'template') {
        return compileSFCTemplate(
          code,
          descriptor.template!,
          filename,
          options,
          this
        )
      }
      if (query.type === 'style') {
        return await transformStyle(
          code,
          filename,
          descriptor,
          Number(query.index),
          this
        )
      }
    },
  }
}

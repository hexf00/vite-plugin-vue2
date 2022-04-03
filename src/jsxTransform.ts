import { transform } from '@babel/core'
import { vueComponentNormalizer, ResolvedOptions, vueHotReload } from './index'

export function transformVueJsx (
  /** 代码 */
  code: string,
  /** 文件路径，或者是转换后的虚拟路径 */
  id: string,
  options: ResolvedOptions
) {
  const { jsxOptions } = options
  const plugins: any[] = [
    [require.resolve('@babel/plugin-proposal-decorators'), { legacy: true }],
    [
      require.resolve('@babel/plugin-proposal-class-properties'),
      { loose: true },
    ],
  ]
  if (/\.tsx$/.test(id)) {
    plugins.unshift([
      require.resolve('@babel/plugin-transform-typescript'),
      { isTSX: true, allowExtensions: true, allowDeclareFields: true },
    ])
  }

  const result = transform(code, {
    presets: [[require.resolve('@vue/babel-preset-jsx'), jsxOptions]],
    sourceFileName: id,
    filename: id,
    sourceMaps: true,
    plugins,
    babelrc: false,
    configFile: false,
  })!


  let className
  const matches = result.code?.match(/export { (.*?) as default }/);
  if (matches) {
    className = matches[1]
  }

  if (!className) {
    throw Error("错误的tsx，需要default 导出");
  }


  // babel编译结果内不改名，无法递归访问
  // class name不能删除，是组件默认的名称所以暂时加个后缀
  result.code = result.code?.replace(
    /class ([a-zA-Z]+?) extends Vue {/,
    'class $1C extends Vue {'
  );

  if (options.devServer && !options.isProduction) {
    return {
      code: result.code +
        `
      /* normalize component */
      import __vue2_normalizer from "${vueComponentNormalizer}"
      var __component__ = /*#__PURE__*/__vue2_normalizer(
      ${className},
      null,
      [],
      false,
      function(){},
      null,
      null,
      null
      )
      `.trim() + `\n` + genHmrCode(
          options.root,
          id,
          false
        ) as string,
      map: result.map as any,
    }
  } else {
    // 生产环境不要hmr代码
    return {
      code: result.code || '',
      map: result.map as any,
    }
  }
}


function genHmrCode (
  root: string,
  id: string,
  functional: boolean,
  templateRequest?: string
) {
  const idJSON = JSON.stringify(id)
  // return `\n/* hot reload */\nconsole.log('want hmr')`
  return `\n/* hot reload */
import __VUE_HMR_RUNTIME__ from ${JSON.stringify(vueHotReload)}
import vue from "vue"
__VUE_HMR_RUNTIME__.install(vue)
if(!import.meta.env.SSR && __VUE_HMR_RUNTIME__.compatible){
  console.log('__VUE_HMR_RUNTIME__.isRecorded(${idJSON})',);

  if (!__VUE_HMR_RUNTIME__.isRecorded(${idJSON})) {
    __VUE_HMR_RUNTIME__.createRecord(${idJSON}, __component__.options)
  }
   import.meta.hot.accept((update) => {
     console.log('accept');
      __VUE_HMR_RUNTIME__.reload(${idJSON}, update.default)
      
      // __VUE_HMR_RUNTIME__.rerender(${idJSON}, update)
   })
}`
}

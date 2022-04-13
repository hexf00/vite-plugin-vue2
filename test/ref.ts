import * as babel from '@babel/core'

const code = `
function Warp(a){ 
  let b= function(){ this.b = 'warp'  };
  b.prototype = new a();
  return b;
}

@Warp
export default class Block {
  render () {
    console.log(new Block().b);
  }
}
`

console.log(
  babel.transformSync(code, {
    plugins: [
      ["@babel/plugin-proposal-decorators", { version: '2021-12', decoratorsBeforeExport: true }],
      // ["@babel/plugin-proposal-class-properties", { "loose": true }]
    ],
  })?.code
)
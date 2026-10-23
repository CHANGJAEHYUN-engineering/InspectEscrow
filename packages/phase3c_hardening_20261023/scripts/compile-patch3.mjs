import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';

const root=process.cwd();
const outDir=path.join(root,'.patch3-build');
fs.rmSync(outDir,{recursive:true,force:true});
fs.mkdirSync(outDir,{recursive:true});

const sourceFiles=[
  'packages/phase3c_hardening_20261023/contracts/InspectEscrowPatch3.sol',
  'packages/phase3c_hardening_20261023/contracts/CredentialRegistryPatch3.sol'
];

const sources=Object.fromEntries(sourceFiles.map(file=>[
  path.basename(file),
  {content:fs.readFileSync(path.join(root,file),'utf8')}
]));

function findImports(importPath){
  const candidates=[
    path.join(root,'node_modules',importPath),
    path.join(root,'packages/phase3c_hardening_20261023/contracts',importPath)
  ];
  for(const p of candidates){
    if(fs.existsSync(p)) return {contents:fs.readFileSync(p,'utf8')};
  }
  return {error:'Import not found: '+importPath};
}

const settings={
  optimizer:{enabled:true,runs:200},
  viaIR:true,
  evmVersion:'cancun',
  outputSelection:{
    '*':{
      '*':['abi','evm.bytecode.object','evm.deployedBytecode.object','metadata']
    }
  }
};

const input={language:'Solidity',sources,settings};
const output=JSON.parse(solc.compile(JSON.stringify(input),{import:findImports}));

for(const diagnostic of output.errors??[]){
  const stream=diagnostic.severity==='error'?console.error:console.warn;
  stream(diagnostic.formattedMessage);
}
if((output.errors??[]).some(x=>x.severity==='error')){
  process.exit(1);
}

const manifest={
  compilerVersion:solc.version(),
  settings,
  contracts:{}
};

for(const [sourceName,contracts] of Object.entries(output.contracts??{})){
  if(!sourceName.endsWith('Patch3.sol')) continue;
  for(const [name,artifact] of Object.entries(contracts)){
    if(!['InspectEscrowPatch3','CredentialRegistryPatch3'].includes(name)) continue;

    const creation=artifact.evm.bytecode.object;
    const runtime=artifact.evm.deployedBytecode.object;
    const creationBytes=creation.length/2;
    const runtimeBytes=runtime.length/2;

    console.log(`${name}: creation=${creationBytes} bytes, runtime=${runtimeBytes} bytes`);

    if(creationBytes>49152){
      throw new Error(`${name} initcode exceeds EIP-3860 limit: ${creationBytes}`);
    }
    if(runtimeBytes>24576){
      throw new Error(`${name} runtime exceeds EIP-170 limit: ${runtimeBytes}`);
    }

    const prefix=path.join(outDir,`${sourceName.replaceAll('/','_')}_${name}`);
    fs.writeFileSync(prefix+'.abi',JSON.stringify(artifact.abi,null,2)+'\n');
    fs.writeFileSync(prefix+'.bin',creation+'\n');
    fs.writeFileSync(prefix+'.runtime.bin',runtime+'\n');

    manifest.contracts[name]={sourceName,creationBytes,runtimeBytes};
  }
}

for(const required of ['InspectEscrowPatch3','CredentialRegistryPatch3']){
  if(!manifest.contracts[required]) throw new Error('Missing compiled contract: '+required);
}

fs.writeFileSync(
  path.join(outDir,'PATCH3_COMPILE_MANIFEST.json'),
  JSON.stringify(manifest,null,2)+'\n'
);
console.log(JSON.stringify(manifest,null,2));

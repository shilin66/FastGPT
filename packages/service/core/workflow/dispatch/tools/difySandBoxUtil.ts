export const transformerPython3 = (code: string, variables: Record<string, any>) => {
  const formatVar = Buffer.from(JSON.stringify(variables)).toString('base64');

  return `
${code}

import json
from base64 import b64decode

# decode and prepare input dict
inputs_obj = json.loads(b64decode('${formatVar}').decode('utf-8'))

# execute main function
output_obj = main(**inputs_obj)

# convert output to json and print
output_json = json.dumps(output_obj, indent=4)

result = f'''<<RESULT>>{output_json}<<RESULT>>'''
print(result)
`;
};

export const transformerNodejs = (code: string, variables: Record<string, any>) => {
  const formatVar = Buffer.from(JSON.stringify(variables)).toString('base64');

  return `
// declare main function
${code}

// decode and prepare input object
const inputs_obj = JSON.parse(Buffer.from('${formatVar}', 'base64').toString('utf-8'))

// execute main function
const output_obj = main(inputs_obj)

// convert output to json and print
const output_json = JSON.stringify(output_obj)

const result = \`<<RESULT>>\${output_json}<<RESULT>>\`
console.log(result);
`;
};

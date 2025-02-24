export const JS_TEMPLATE = `function main({data1, data2}){
    
    return {
        result: data1,
        data2
    }
}`;

export const PYTHON_TEMPLATE = `def main(data1: str, data2: str) -> dict:
    
    return {
        "result": data1,
        "data2": data2
    }`;

import { useBear } from "./src/core.js";

const { getHome, setHome } = await useBear(
    process.env.LOGIN,
    process.env.PASSWORD
);
const home = await getHome();
const newHome = {...home, title: "Martijn has Bear", favicon: "✍️"};
console.log(await setHome(newHome));

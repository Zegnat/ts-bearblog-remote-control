import { findOne, textContent } from "domutils";
import * as htmlparser2 from "htmlparser2";

export type CookieJar = {
  sessionid: string;
};

const getCsrfMiddlewareTokens = async (url: string, session?: CookieJar) => {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...(session !== undefined
      ? { headers: { cookie: `sessionid=${session.sessionid}` } }
      : {}),
  });
  const cookies = response.headers.getAll("set-cookie");
  const cookie = cookies.reduce<null | string>((_, input) => {
    const matched = input.match(/csrftoken=([^;]+)/);
    return matched === null ? null : matched[1];
  }, null);
  if (cookie === null) {
    throw new Error(`No CSRF token cookie found in ${JSON.stringify(cookies)}`);
  }
  const body = await response.text();
  const matched = body.match(/name="csrfmiddlewaretoken" value="([^"]+)"/);
  if (matched === null) {
    throw new Error(`No CSRF token found on "${url}".`);
  }
  return {
    cookie,
    form: matched[1],
  };
};

const cookieBuilder = (csrftoken: string, sessionid?: string) =>
  [`csrftoken=${csrftoken}`, sessionid ? `sessionid=${sessionid}` : undefined]
    .filter((v) => v !== undefined)
    .join(";");

const postToBear = async <Body extends object>(
  url: string,
  body: Body,
  session?: CookieJar
) => {
  const csrftokens = await getCsrfMiddlewareTokens(url, session);
  const cookieString = cookieBuilder(csrftokens.cookie, session?.sessionid);
  const requestBody = new URLSearchParams({
    ...body,
    csrfmiddlewaretoken: csrftokens.form,
  }).toString();
  console.log({requestBody});
  const result = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookieString,
    },
    body: requestBody,
    credentials: "same-origin",
    redirect: "manual",
  });
  return result;
};

export const getLoginSession = async (login: string, password: string) => {
  const response = await postToBear("https://bearblog.dev/accounts/login/", {
    login,
    password,
  });
  const cookies = response.headers.getAll("set-cookie");
  const cookie = cookies.reduce<null | string>((_, input) => {
    const matched = input.match(/sessionid=([^;]+)/);
    return matched === null ? null : matched[1];
  }, null);
  if (cookie === null) {
    throw new Error(`No session ID found in ${JSON.stringify(cookies)}`);
  }
  return { sessionid: cookie };
};

const homeOptions = [
  "title",
  "bear_domain",
  "custom_domain",
  "favicon",
  "meta_description",
  "meta_image",
  "lang",
  "custom_meta_tag",
] as const;
type HomeOption = typeof homeOptions[number];
const isHomeOption = (option: string): option is HomeOption =>
  homeOptions.some((allowed) => option === allowed);
type Home = Partial<Record<HomeOption, string>> & {
  content: string;
};

const rawContentToHome = (rawContent: string): Home => {
  const [options, ...rest] = rawContent.split("\n___\n");
  const content = rest.join("\n___\n");
  const output: Home = { content };
  for (const option of options.split("\n")) {
    const matched = option.match(/^([^:]+): (.+)$/);
    if (matched === null || !isHomeOption(matched[1])) continue;
    output[matched[1]] = matched[2];
  }
  return output;
};
const homeToRawContent = (home: Home): string => {
  const rawArray = ["\r\n___\r\n"];
  for (const option in home) {
    if (option === "content") {
      rawArray.push(home.content);
    } else if (isHomeOption(option)) {
      rawArray.unshift(`${option}: ${home[option]}`);
    }
  }
  return rawArray.join("\r\n");
};

export const getHome = async (session: CookieJar): Promise<Home> => {
  const url = "https://bearblog.dev/studio/";
  const response = await fetch(url, {
    headers: { cookie: `sessionid=${session.sessionid}` },
  });
  const body = await response.text();
  const parsed = htmlparser2.parseDocument(body);
  const textarea = findOne(
    (element) =>
      element.name === "textarea" &&
      element.attributes.some((attribute) => {
        return attribute.name === "name" && attribute.value === "raw_content";
      }),
    parsed.children
  );
  if (textarea === null) {
    throw new Error("Could not access the data.");
  }
  return rawContentToHome(textContent(textarea));
};

export const setHome = async (session: CookieJar, home: Home) => {
  const url = "https://bearblog.dev/studio/";
  const response = await postToBear(
    url,
    {
      raw_content: homeToRawContent(home),
    },
    session
  );
  return response.ok;
};

export const useBear = async (login: string, password: string) => {
  const session = await getLoginSession(login, password);
  return {
    getHome: async () => getHome(session),
    setHome: async (home: Home) => setHome(session, home),
  };
};

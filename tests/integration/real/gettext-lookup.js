// Run with: LC_ALL=<a locale installed in the container> gjs -m tests/integration/real/gettext-lookup.js <locale dir> <domain> '<json array of msgids>'
// Looks the messages up with the REAL gettext, exactly as the Shell does for an extension: the user's locale
// (from the environment) is expanded to candidate names and the first catalogue found is used. Prints a JSON
// object of msgid -> translation.
import Gettext from 'gettext';
import { programArgs } from 'system';

const [localeDir, domain, ids] = programArgs;
Gettext.setlocale(Gettext.LocaleCategory.ALL, '');
Gettext.bindtextdomain(domain, localeDir);
Gettext.textdomain(domain);
print(JSON.stringify(Object.fromEntries(JSON.parse(ids).map((id) => [id, Gettext.gettext(id)]))));

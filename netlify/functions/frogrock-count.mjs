/* How many people have pledged. Public, and a number is all it gives.
 *
 * The page needs this to draw the counter, so unlike the reader it is open to
 * anybody. It is therefore written so that there is nothing here worth taking:
 * it lists the store's keys, counts them, and returns the count with the target.
 * It never calls get(), so no record is ever loaded into this function, and a
 * key is a sha256 hash with no record attached to it.
 *
 * WHY A COUNT IS SAFE TO PUBLISH and a key is not. The count is the one figure
 * the offer is built on, and G is making it public on the page anyway. The keys
 * are hashes of email addresses, and a hash of a low entropy value is reversible
 * by anybody with a word list, so they stay inside this function.
 *
 * On a store that is not there yet this answers zero rather than an error. An
 * empty store and an unconfigured one look the same from here, and a counter
 * that reads nothing is better than a page with a broken number on it.
 */
import { getStore } from '@netlify/blobs';
import { progress, STORE } from './_frogrock_pledge.mjs';

export default async () => {
  let count = 0;
  try {
    const { blobs } = await getStore({ name: STORE, consistency: 'strong' }).list();
    count = blobs.length;
  } catch (err) {
    console.error('frogrock-count: store read failed', err);
  }

  return new Response(JSON.stringify(progress(count)), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      /* Short rather than none. The number moves slowly and the page asks for it
         on every load, so a minute of cache costs nothing a backer would notice
         and saves a store listing per visitor. */
      'cache-control': 'public, max-age=60'
    }
  });
};

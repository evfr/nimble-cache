class HybridCache {
    constructor(maxSize, cachePartition) {
      this.cache8KbMaxSize = Math.floor(maxSize * 1024 * cachePartition / 8);
      this.cache64KbMaxSize = Math.floor(maxSize * 1024 * (1 - cachePartition) / 64);
      this.cache8KB = new Map();
      this.cache64KB = new Map();
      this.accessOrder8KB = [];
      this.accessOrder64KB = [];
      this.usageCounts8KB = new Map();
      this.usageCounts64KB = new Map();
    }
  
    get(chunkSize, key) {
      if (chunkSize === 8) {
        return this.getFromCache({
          cache: this.cache8KB,
          accessOrder: this.accessOrder8KB,
          usageCounts: this.usageCounts8KB,
          key,
          chunkSize
        });
      } else if (chunkSize === 64) {
        return this.getFromCache({
          cache: this.cache64KB,
          accessOrder: this.accessOrder64KB,
          usageCounts: this.usageCounts64KB,
          key,
          chunkSize
        });
      } else {
        return null;
      }
    }

    getFromCache(fromCache) {
      const {cache, accessOrder, usageCounts, key, chunkSize} = fromCache;
      if (cache.has(key)) {
        // Update the LRU order
        if (chunkSize === 8) this.updateLRUOrder(accessOrder, key);
        // Update the usage count for LFU characteristics
        this.updateUsageCount(usageCounts, key);
        return cache.get(key);
      } else {
        return null;
      }
    }  

    put(chunkSize, key, value) {
      if (chunkSize === 8) {
        this.putInCache({
          cache: this.cache8KB,
          accessOrder: this.accessOrder8KB,
          usageCounts: this.usageCounts8KB,
          key,
          value,
          chunkSize,
          maxSize: this.cache8KbMaxSize
        });
      } else if (chunkSize === 64) {
        this.putInCache({
          cache: this.cache64KB,
          accessOrder: this.accessOrder8KB,
          usageCounts: this.usageCounts64KB,
          key,
          value,
          chunkSize,
          maxSize: this.cache64KbMaxSize
        });
      }
    }
  
    putInCache(intoCache) {
      const { cache, accessOrder, usageCounts, key, value, chunkSize, maxSize} = intoCache;
      if (cache.size >= maxSize) {
        if (chunkSize === 8) {
          // Remove the least recently used item
          const lruKey = accessOrder.shift();
          cache.delete(lruKey);
          usageCounts.delete(lruKey);          
        } else {
          // Remove by the 8kb LRU item and by the 64kb LFU 
          const tempArr = Array.from(usageCounts.entries());
          // Sort the array based on hits number
          tempArr.sort((a, b) => a[1] - b[1]);
          let chunkToRemoveKey = tempArr[0][0];;

          // Find the key to remove
          for(let i = 0; i < tempArr.length; i++) {
            //do not remove the current key
            if (tempArr[i][0] === key) continue;
            const accessOrderInd = accessOrder.indexOf(tempArr[i][0]);
            if (accessOrderInd < accessOrder.length / 2) {
              chunkToRemoveKey = tempArr[i][0];
              break;
            }
          }
          cache.delete(chunkToRemoveKey);
          usageCounts.delete(chunkToRemoveKey);   
        }
      }

      // Add the new item
      cache.set(key, value);
      if (chunkSize === 8) accessOrder.push(key);
      // Initialize the usage count for LFU characteristics
      usageCounts.set(key, 1);
    }
  
    updateLRUOrder(accessOrder, key) {
      // Move the accessed key to the end of the access order q
      const index = accessOrder.indexOf(key);
      accessOrder.splice(index, 1);
      accessOrder.push(key);
    }
  
    updateUsageCount(usageCounts, key) {
      // Increment the usage count for LFU
      const count = usageCounts.get(key) || 0;
      usageCounts.set(key, count + 1);
    }
  }

  //==============================================================================
  // usage:
  const cache = new HybridCache(3, 0.9); 
  
  async function read8(offset) {
    let chunk8 = cache.get(8,  `offset${offset}_8kb`);
    let chunk64 = cache.get(64,  `offset${offset}_64kb`);

    if (chunk8 && chunk64) return chunk8;

    if (!chunk8) {
        chunk8 = readFromDb(offset, 8);
        cache.put(8, `offset${offset}_8kb`, chunk8);
    }

    if (!chunk64) {
        setTimeout(async () => {
          // Fetch 64KB chunk after half a 0.1 seconds
          console.log("No 64KB cache - reading from DB");
          // Fetch data from the file and then store it in the cache
          chunk64 = await readFromDb(offset, 64);
          cache.put(64, `offset${offset}_64kb`, chunk64);
        }, 100);
    }

    return `offset${offset}_8kb`
  }
  
  async function read64(offset) {
    const cacheVal = cache.get(64, `offset${offset}_64kb`);
    if (cacheVal) return cacheVal;
    const fromDb = await readFromDb(offset, 64);
    cache.put(64, `offset${offset}_64kb`, fromDb);
    return fromDb;
  }


  async function readFromDb(offset, size) {
    console.log(`reading from DB offset ${offset} size ${size}`);
    const data = `offset${offset}_${size}kb`;
    return data;
  }


  const a = read8(1);
  const b = read8(1);
  const c = read8(2);
  const d = read8(3);

  setTimeout(async () => { 
    console.log('2sek');

    let e = await read64(1);
    e = await read64(1);
    e = await read8(2);
    e = await read8(3);
    e = await read8(4);
    e = await read8(5);
    e = await read8(6);
    e = await read64(6);

    e = await read64(1);
    e = await read8(3);
    e = await read8(4);
    e = await read8(5);
    e = await read64(6);
    e = await read8(7);
  }, 2000 );

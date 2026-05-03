const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_DATA = {
  guilds: {},
};

class Database {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.filePath = path.join(baseDir, "store.json");
    this.ensure();
  }

  ensure() {
    fs.mkdirSync(this.baseDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify(DEFAULT_DATA, null, 2), "utf8");
    }
  }

  read() {
    const raw = fs.readFileSync(this.filePath, "utf8");
    return JSON.parse(raw);
  }

  write(data) {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }

  update(mutator) {
    const data = this.read();
    const result = mutator(data) || data;
    this.write(result);
    return result;
  }
}

module.exports = { Database };

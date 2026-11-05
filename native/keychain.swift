import Foundation
import Security

// A small, fixed-service helper. It has no command-line credential parameters or logging.
// Use the file-based login keychain so a locally built, unsigned DBX plugin needs no app entitlement.
let service = "local.kingbase.debugger.database-password"
func respond(_ value: [String: Any]) -> Never {
    if let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) {
        FileHandle.standardOutput.write(data)
    }
    exit(0)
}
let input = FileHandle.standardInput.readDataToEndOfFile()
guard input.count <= 128 * 1024,
      let request = (try? JSONSerialization.jsonObject(with: input)) as? [String: Any],
      let operation = request["operation"] as? String,
      ["has", "get", "set", "delete"].contains(operation),
      let account = request["account"] as? String,
      account.range(of: "^private-[a-f0-9-]{36}:[a-f0-9]{64}$", options: .regularExpression) != nil
else { respond(["ok": false, "status": Int(errSecParam)]) }

let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                            kSecAttrService as String: service,
                            kSecAttrAccount as String: account,
                            kSecAttrSynchronizable as String: false]
var status: OSStatus = errSecSuccess
switch operation {
case "has", "get":
    var lookup = query
    lookup[kSecMatchLimit as String] = kSecMatchLimitOne
    lookup[operation == "get" ? kSecReturnData as String : kSecReturnAttributes as String] = true
    var result: CFTypeRef?
    status = SecItemCopyMatching(lookup as CFDictionary, &result)
    if status == errSecItemNotFound { respond(["ok": true, "found": false]) }
    if status == errSecSuccess {
        if operation == "get" {
            guard let data = result as? Data, let stored = String(data: data, encoding: .utf8), stored.hasPrefix("DBX-KB-1\n")
            else { respond(["ok": false, "status": Int(errSecDecode)]) }
            let password = String(stored.dropFirst("DBX-KB-1\n".count))
            respond(["ok": true, "found": true, "password": password])
        }
        respond(["ok": true, "found": true])
    }
case "set":
    guard let password = request["password"] as? String, password.utf8.count <= 65536
    else { respond(["ok": false, "status": Int(errSecParam)]) }
    // A nonempty envelope also lets SecItemUpdate replace a nonempty password with an empty one.
    let attributes: [String: Any] = [kSecValueData as String: Data(("DBX-KB-1\n" + password).utf8),
                                   kSecAttrLabel as String: "DBX 金仓调试 · 数据库密码"]
    status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
    if status == errSecItemNotFound {
        var item = query
        for (key, value) in attributes { item[key] = value }
        status = SecItemAdd(item as CFDictionary, nil)
    }
case "delete":
    status = SecItemDelete(query as CFDictionary)
    if status == errSecItemNotFound { status = errSecSuccess }
default: break
}
respond(["ok": status == errSecSuccess, "status": Int(status)])

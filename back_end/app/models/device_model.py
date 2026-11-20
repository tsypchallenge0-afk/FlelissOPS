class DeviceModel:

    def __init__(self, house_id, name, type, category, position="Middle-Center"):
        self.house_id = house_id
        self.name = name
        self.type = type
        self.category = category
        self.status = "offline"
        self.position = position

    def to_dict(self):
        return {
            "house_id": self.house_id,
            "name": self.name,
            "type": self.type,
            "category": self.category,
            "status": self.status,
            "position": self.position
        }

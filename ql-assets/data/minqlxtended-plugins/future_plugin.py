import minqlxtended


class future_plugin(minqlxtended.Plugin):
    def __init__(self):
        super().__init__()
        self.set_cvar_once("qlx_helloGreeting", "Hello from QLSM!")
        self.set_cvar_once("qlx_helloEnabled", "1")
        self.add_command("hello", self.cmd_hello)

    def cmd_hello(self, player, msg, channel):
        if not self.get_cvar("qlx_helloEnabled", bool):
            return
        channel.reply(self.get_cvar("qlx_helloGreeting"))
